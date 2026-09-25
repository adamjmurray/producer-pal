# Live API Measurement

Recording a Live Set, counting the LiveAPI objects a call builds, and timing
calls against real Live. Index: [README.md](README.md).

## Dumping a Live Set

`scripts/live-api/dump-live-set/` records a running Set's structure as JSON. The
checked-in result is `src/test/fixtures/live-set-dump.json.gz`, loaded by
`loadLiveSetDump()` beside it.

```bash
node scripts/live-api/dump-live-set/dump-live-set.ts tmp/scratch.json
node scripts/live-api/dump-live-set/dump-live-set.ts tmp/scratch.json --skip=parameters

# regenerate the committed fixture
node scripts/live-api/dump-live-set/dump-live-set.ts \
  src/test/fixtures/live-set-dump.json --gzip --max-objects=200000 \
  --root=live_set --root=this_device --root=live_app
```

Keep all three roots. Tools resolve `this_device` and `live_app` directly, and a
`live_set`-only walk records neither — `this_device` alone is resolved 20 times
by one `read-live-set` call. They cost 2 objects.

`--max-objects` defaults to 20000, which a Set with a few drum racks blows
through — check `meta.truncated` rather than trusting a dump that stopped early.

Needs Live running with the device loaded and the `ppal-live-api` tool available
(a `build:debug` build, or the Setup tab toggle). It only reads.

Each object holds the raw `get()` result for **every** property its own `info`
names — not only the ones the tools read today. A fixture recording just today's
reads goes stale silently: the walk a tool does stops early against it, the
count comes out low, and the budget test passes for the wrong reason.

`info` is read **per object**, never cached by class or path shape. Live answers
differently object by object: a Drum Rack and an Instrument Rack are both
`RackDevice` at the same path shape, and only the Drum Rack lists `drum_pads`.
Sharing a listing across a shape cost a real 128-pad Drum Rack every one of its
pads and reported nothing wrong. Identical listings still share one `types`
entry; a class that answers more than one way gets an entry per answer, labelled
with a path where it was seen, and objects name theirs in `typeKey`.

Objects are recorded under the path **Live** reports, not the one the walk asked
for. Live canonicalizes: it answers `live_set tracks 0 clip_slots 0` for a slot
reached through a scene. Keying by what was asked filed 96 clip slots under
`live_set scenes N clip_slots M`, and an arrangement clip under
`live_set view detail_clip`. Every other spelling becomes an `aliases` entry.
`canonical_parent` is the exception: its value is recorded but it is never
followed, or every object in the Set would gain an alias nothing builds.

Absolute filesystem paths are replaced unless `--keep-paths` is passed, so a
dump doesn't name the machine it came from or the samples on it.

Device parameters are most of the objects in a Set full of instruments — 90% of
the committed fixture. `--skip=parameters` shrinks the dump an order of
magnitude and makes `read-device` budgets meaningless; the summary's per-type
counts say what you would be dropping. `--gzip` is the better answer to size: it
takes 13 MB of JSON down to ~740 KB, which costs 40ms to load and keeps every
parameter. Slimming the parameter property bags instead is not worth it — the
bulk is 26k long path keys, not the values.

The Set behind the fixture is deliberately extreme, because the point is to
measure against shapes a real Set produces rather than shapes a mock happens to
cover: four drum racks (512 pads, 107 populated), an instrument rack nested four
levels deep, six rack return chains, take lanes, deactivated devices, and both
session and arrangement clips. Keep the `.als` outside the repo; `meta` records
the Live version a dump came from.

## Counting LiveAPI Objects

Constructing a LiveAPI object is the expensive part (see
`src/live-api-adapter/live-api-release.ts`), so a call that builds the same
object twice pays twice. Pooling can't help a single big call — the free list
refills only when the last scope closes.

The counter lives in `src/live-api-adapter/live-api-build-stats.ts`. Unit tests
run it always; a build only carries it with `ENABLE_BUILD_STATS=true`, and every
other build gets a do-nothing stub in its place.

### Two numbers, and the difference matters

- **Resolved** is how many times the call asked for an object. It depends on the
  tool and the Live Set and nothing else, so this is the number to compare
  against a test.
- **Constructed** is how many of those had to build one. It depends on how full
  the pool was, so it moves run to run and compares to nothing.

Repeats are resolved minus distinct. Targets are grouped by shape — indices
replaced with `*` — so a Set with a target per clip still reports in a few
lines, and the shapes compare directly between a real Set and a fixture.

### In tests

`liveApiBuildStats()` returns the counts for the current test; the global
`beforeEach` resets it. Tests never open a release scope, so the pool stays cold
and every resolution constructs — the count is exactly what the call asked for.

### Against real Ableton

```bash
ENABLE_BUILD_STATS=true npm run build:debug
```

Every tool response then carries a `WARNING: LiveAPI stats: …` line. That line
is also how you know the device is instrumented: **a plain `npm run build`
silently overwrites it**, and nothing else says so.

Run one call at a time. The counters reset once per request, so overlapping
calls mix their counts.

## Object staleness probe

`ENABLE_OBJECT_PROBE=true` adds an optional `path` to each `ppal-live-api`
operation, so one call can mutate through one object while still holding another
— the question of whether a held object goes stale after a mutation. The field
is absent from every other build. See `dev/live-api/Object-Reuse.md` for what is
open and how to drive it.

Do this whenever a budget test's fixture changes. A test that counts against the
mock is measuring the mock: a fixture missing a property the tools read makes a
walk stop early and the count comes out low — green, and wrong in the flattering
direction. Only the same call against real Live catches that.

Missing _objects_ mislead the same way. A drum-pads budget test once read 49 on
a fixture listing the 16 pads its kit filled, while real Live read 137 on a kit
of 4 — because a Drum Rack carries a pad for all 128 notes and the fixture
carried none of the empty ones. Give a fixture the objects Live gives it, not
just the ones the test cares about.

### What the counts can't see

The counter finds one kind of waste: the same target resolved more than once. It
is blind to the other kind — distinct objects built once, correctly, and then
thrown away.

Both are worth fixing and only one shows up in the numbers. A `drum-map` read of
a track whose rack holds no drum rack once built 174 objects, returned no drum
map at all, and reported zero repeats. Nearly pure waste, scored clean.

So read a repeat count as a floor, not a ceiling, and compare what a call
returned against what it built.

Fixture shape drives the answer more than size does. A Drum Rack makes the
drum-mode walk _cheaper_, because `containerHasDrumRack()` returns on the first
device with pads — the expensive shape is a rack with no drum rack in it, which
gets recursed through entirely.

### Attributing a count to a call site

The counter says which targets were resolved, not who asked. When the shapes
aren't enough, capture a stack in `recordLiveApiResolve` — but only under
vitest, where frames name source files. A bundled V8 stack names bundle offsets.
Match filenames with `[\w.-]+\.ts`; without the dot, a `foo.def.ts` frame
reports as `def.ts`.

## Timing Tool Calls

`scripts/probes/tool-call-cost-probe.ts` runs one tool call repeatedly and
prints, per call, how long it took and — on an instrumented build — what it
resolved and constructed.

```bash
node scripts/probes/tool-call-cost-probe.ts ppal-read-device \
  '{"path":"t17/d0/c0/d0","include":["*"],"maxDepth":3}' 12
```

Read the two together. Latency alone can't tell a slow tool from one that
rebuilds its objects on every call, and the counts alone can't say whether the
rebuilding costs anything.

**A `constructed` count above zero after the first call means the pool isn't
covering this call**, so every repeat pays construction again — and each
construction registers a context in MxDCore that only a device reload takes
back, so latency climbs and never comes down. The probe says so in its summary.
That is how the free-list ceiling was found to be too low: a deep 64-pad kit
read rebuilt 803 objects a call and went 2.2 s to 5.9 s over twelve calls, where
a ceiling above the call's own size held it flat at 1.2 s.

**Reload the device between runs you mean to compare.** Every call loads it
further, so a second run starts slower for reasons that have nothing to do with
what changed. Reopening the Live Set (`./scripts/open-live-set`) does it.

`scripts/probes/live-api-context-probe.ts` answers the other question — how
latency grows with objects built and paths visited, and which of the two a
slowdown is coming from. Its header explains the arms.
