# LiveAPI Performance

What object lifetime costs in time and in memory, what 2.2.0 changed, and how to
re-measure it. `dev/LiveAPI-Object-Reuse.md` covers the correctness side — when
reusing an object is safe. ADR-0023 covers why objects are pooled rather than
cached.

## Three costs, and only one of them saturates

Every number below traces back to one of these. All measured on Live 12.4.3.

**Path listeners.** Live arms a listener on each collection along a path-based
object's path and never takes it down; assigning an empty path is the only thing
that does. Every armed listener is notified on any structural change to the Live
Set, so held objects make the Set itself slower — a track add and delete took
120 ms with none held and 630 ms with 7,190 held. Fully recoverable: clear the
paths and it all comes back.

**Construction.** Building an object registers a context in MxDCore that
clearing the path does not take back. Only a device reload does. Every later
read pays a little more for it, and it never saturates — this is the one that
turns a long session slow. Retargeting an existing object avoids it entirely.

**Path visits.** Visiting a path registers something too, but once per path. It
rises while a session reaches new corners of the Set and then stops, so a
latency curve that climbs and flattens is this, not a leak.

That saturation is about _latency only_. Memory keeps growing per resolution
however many times the same path is revisited — see "Memory grows per
resolution" below.

Telling the last two apart takes `scripts/probes/live-api-context-probe.ts`:
repeated paths read flat while never-repeating ones climbed 1.52x.

## What 2.2.0 changed

**Every tool releases what it builds.** 500 `ppal-read-track` calls used to
leave 5,252 listeners armed, enough to make the next track delete write 26 MB to
Ableton's log. The same 500 now arm zero and write nothing.

**Released objects are pooled and retargeted.** Over 2,500 read-track calls a
read went 54 ms to 90 ms pooled, against 534 ms to 1.1 s unpooled — same 90,006
acquisitions either way. Closing the last gap, retargeting id targets as well as
paths, took the same loop from 34.8 to 11.6 ms/call, flat.

**The free list is sized above the biggest single request**, not the ordinary
one. At the old 512, a deep 64-pad kit read (1,314 objects) rebuilt 803 of them
on every repeat and climbed 2.2 s to 5.9 s over twelve calls. See
`MAX_POOLED_OBJECTS` in `live-api-adapter/live-api-release.ts`.

**Six stable targets resolve once per request** — `live_set`, the master track,
`this_device` and three others that name one object nothing can repoint. The
header comment of `live-api-adapter/live-api-build.ts` says why the list is that
short. `this_device` is the biggest of them on a full read: 12 resolutions of
one object on a 12-track Set.

**Tools stopped building objects they don't read.** Reading one property no
longer builds the whole collection it belongs to; a session grid is counted once
rather than once down each scene and again along each track; a clip is resolved
before its address is proved rather than after. Counted against the mock:
create-device on a 16-chain rack 336 to 80 builds, an 8-slot track read 26 to
10, a 16x16 session grid 512 to 256.

**Drum reads stopped building pads and mixers nobody sees.** Against real Live,
naming a four-pad kit's pads went 137 objects to 10. Against the mock, a 64-pad
kit's drum map went 769 to 129 and `read-device drum-pads` 193 to 49.

## Where it stands

Measured with an instrumented build against the counter Set (20 tracks, 13
scenes, four drum racks, a four-level instrument rack — see
`dev/Development-Tools.md` -> Dumping a Live Set):

| call                                       | resolved            | constructed, warm pool |
| ------------------------------------------ | ------------------- | ---------------------- |
| `read-live-set` `*`                        | 494                 | 0                      |
| `read-track` `*`, tracks 15-18             | 75 / 92 / 163 / 141 | 0                      |
| `read-device` `*` on a 64-pad kit, depth 3 | 1,314               | 0                      |

A warm pool builds nothing, which is the whole claim. The deep kit read holds
flat at about 1.2 s per call; at the old ceiling the same call was past 5.9 s by
its twelfth run and still climbing.

## Return chain names are read once per rack

A chain with a send turned up has to name the returns it feeds, and those names
live on the rack. Reading them per chain cost `1 + returnCount` objects a pad:
on the counter Set's 64-pad kit, `read-device` with chains resolved 1,154
objects for 712 targets and took 1.0 s a call. Naming them once per rack
(`requestMemo` in `live-api-adapter/live-api-release.ts`) took it to 713
resolutions and 0.52 s, with identical output. It scales with pads, so a 128-pad
kit saves twice that.

`read-track` never reaches this — it does not descend into rack chains at any
depth. Only `read-device` on the rack does.

## Memory grows per resolution, and never saturates

Live's memory climbs about **3.2 KB per object resolved**, on top of a floor of
about **6 KB per request**. It does not level off, and a forced full GC does not
give it back. A `ppal-read-live-set` with everything included resolves 120
objects and costs 0.39 MB — every call, forever.

This is not construction and not listeners. Measured from a cold Live 12.4.5,
500 identical full reads: the pool served every one of them after the first
(`constructed` 106 on call 1, then 0), latency stayed flat at 29 ms, and RSS
still went 1174.9 to 1370.9 MB in a straight line.

What the cost tracks is resolving an object, not using one:

| driver                          | resolved/call | MB/call |
| ------------------------------- | ------------: | ------: |
| `read-live-set {include:["*"]}` |           120 |    0.39 |
| `read-track {trackIndex:0}`     |            11 |   0.035 |
| `read-live-set {}`              |             4 |   0.019 |
| a tool touching no Live objects |             0 |  ~0.005 |

Operations on an already-resolved object are roughly 20x cheaper: 50 `get`s per
call instead of one added 6.7 KB across 49 extra reads, about **137 bytes per
get**, and `call` measured the same. Writing a property its own current value
added nothing measurable — that is Live no-opping an unchanged write, so it says
nothing about what a real write costs.

**Why this matters.** At 0.39 MB per full-set read it takes on the order of
10,000 calls to reach 4 GB. Live 12.4.5 died of a V8 `FatalProcessOutOfMemory`
after 2.5 days of eval runs, in `Object.defineProperty`. Our own
`defineProperty` calls are all on `LiveAPI.prototype` and guarded, so they run
once; the growth here is per resolution and is the better fit.

One thing this measurement cannot settle: RSS cannot separate the V8 heap from
Max's own C++ allocation, so "V8 heap leak" stays a hypothesis.

### Where the 3.2 KB goes, and why we keep paying it

Split by a probe build that memoized every target across requests and never
released, so nothing was ever re-resolved:

| build                     | MB/call | latency         |
| ------------------------- | ------: | --------------- |
| pool + release (shipping) |    0.39 | 29 ms, flat     |
| hold everything           |   0.149 | 40 ms, climbing |

So roughly **2.0 KB per resolution is the retarget plus release**, and the rest
is the property reads themselves. That residual checks out against the per-get
number independently: 120 objects at 8-10 reads each at ~137 B is about 0.14 MB.

**Holding objects is not the fix, and the reason is the whole design.** What
holding gives back in memory it takes in armed path listeners — the cost the
release mechanism exists to remove. That cost is worse in kind: it makes Live
itself progressively slower, and it drove Ableton's log to 26 MB on a single
track delete. A leak that needs tens of thousands of requests to matter is the
better trade against a session that degrades while you work.

A cross-request cache also can't stay correct for free. On delete, a held
object's `path` clears but its `id` stays stale, so `exists()` — read off the id
— reports `true` for something that is gone, and `confirmDeleted` works today
only because `LiveAPI.from(id)` re-resolves and reads `"0"`. A cache would have
to re-assign the id on every hit, which is the retarget, handing back most of
the 2.0 KB. The `exists()` gate has a second edge: memo hits are checked with
it, so nonexistent targets (empty clip slots) miss every call and then construct
against a starved pool. Held-with-the-gate measured 0.48 MB/call, _worse_ than
shipping.

**So the rate per resolution is intrinsic — but the resolution count is ours.**
Growth is proportional to objects resolved, so every fix in "What still costs"
is a memory fix at the same time.

### Measuring it

Max's V8 exposes no heap readout: no `performance.memory`, no `process`, no `v8`
global, and `require` resolves none of `v8`, `node:v8`, `process`, `os`. It does
expose **`globalThis.gc()`**, which runs a full GC in about 6 ms.

So: call `gc()` at the top of `callTool` in `live-api-adapter.ts`, build with
`ENABLE_BUILD_STATS=true npm run build:debug`, then hammer one tool and sample
`ps -o rss= -p <live pid>` between calls. The forced GC is what makes RSS read
as retained memory rather than garbage. Read the RSS delta next to the
`constructed` count — the point is growth while nothing is being constructed.

Restart Live before a run you mean to compare, or the pool is already warm and
the first-call construction spike is missing.

To split retarget/release from the reads, memoize every target across requests
(drop the `STABLE_TARGETS` check and the `exists()` gate in `live-api-build.ts`)
and return early from `endLiveApiScope` in `live-api-release.ts`. Probe builds
only — both break correctness by design.

## What still costs

**Repeats inside one request.** `read-track` on the four-level instrument rack
resolves 141 objects for 82 distinct targets. Fixing that means holding an
object across a stretch of a request, which is the defect class in
`dev/LiveAPI-Object-Reuse.md` — deferred until a probe can settle it. Those 59
extra resolutions cost memory as well as time, at the rate above.

**Waste the counter can't see.** It finds the same target resolved twice. It is
blind to distinct objects built once, correctly, and thrown away: a drum-map
read of a rack with no drum rack in it built 174 objects, returned no drum map,
and scored zero repeats.

**Concurrent requests don't pool.** The free list only refills when no scope is
open, so overlapping calls construct. Sequential calls — the normal case —
recycle every request.

**Building an N-pad kit is quadratic in the chain enumeration.**
`chainsForInNote` builds _every_ chain on the rack to read `in_note`, and the
pad-resolution path calls it once per addressed pad. An 8-pad kit build spent 28
of its 45 resolutions there. Not memoized — `requestMemo` serves only
`return-chain-info` and `songMeter`.

`pad.getChildCount("chains")` gives the count with no objects at all, and the
read path already uses exactly that (see `read-device-drum-pad-helpers.ts`,
where the comment records why the two collections aren't interchangeable: the
rack's chain list and the pad's hold the same chains in different orders once a
pad is layered). That only helps the callers wanting a count, though — the
chain-index resolver needs the actual objects to index into.

## Re-measuring

`dev/Development-Tools.md` has both procedures: **Counting LiveAPI Objects** for
what a call asks the Live API for, and **Timing Tool Calls** for what that
costs. Two rules carry most of the risk:

- **Measure against real Live before believing a build-count fix.** A fixture
  missing objects a real Set has makes a walk stop early, and the count comes
  out low — green, and wrong in the flattering direction. A drum-pads budget
  test once read 49 on the mock while real Live read 137 on a smaller kit.
- **Reload the device between runs you compare.** Every call loads it further,
  so a second run starts slower for reasons unrelated to what changed.
