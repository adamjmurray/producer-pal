# LiveAPI Performance

What object lifetime costs, what 2.2.0 changed, and how to re-measure it.
`dev/LiveAPI-Object-Reuse.md` covers the correctness side — when reusing an
object is safe. ADR-0023 covers why objects are pooled rather than cached.

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

**Six stable targets resolve once per request** — `live_set`, `this_device` and
four others that name one object for the life of the Set. ADR-0028 says why the
list is that short.

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

## What still costs

**Repeats inside one request.** `read-track` on the four-level instrument rack
resolves 141 objects for 82 distinct targets. Fixing that means holding an
object across a stretch of a request, which is the defect class in
`dev/LiveAPI-Object-Reuse.md` — deferred until a probe can settle it.

**Waste the counter can't see.** It finds the same target resolved twice. It is
blind to distinct objects built once, correctly, and thrown away: a drum-map
read of a rack with no drum rack in it built 174 objects, returned no drum map,
and scored zero repeats.

**Concurrent requests don't pool.** The free list only refills when no scope is
open, so overlapping calls construct. Sequential calls — the normal case —
recycle every request.

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
