# ADR-0023: LiveAPI objects are released and pooled, never held across requests

- **Status:** Accepted
- **Date logged:** 2026-08-15

## Context

Live arms a listener on every collection along a path-based `LiveAPI` object's
path, and never takes it down. Each armed listener has to be notified on any
structural change to the Live Set, so held objects make the Set itself slower:
on 12.4.3, adding and deleting a track took 120 ms with none held and 630 ms
with 7,190 held. Assigning an empty path is the only thing that disarms them.

Construction is a second, separate cost. It registers a context in MxDCore that
clearing the path does not take back — only a device reload does — so building
an object runs about 14 ms slower than retargeting an existing one, and each
build slows every later read a little.

Both costs grow with how long a session runs, which is what made this worth
settling rather than tuning.

## Decision

Objects are tracked as they are built and released when the request ends: mode
reset to 0, path cleared, then onto a free list that the next request retargets.
Nothing holds a `LiveAPI` across requests.

Within a request, a few targets are resolved once and reused rather than
retargeted again — ADR-0028 says which, and why the list is as short as it is.

Both target forms retarget a pooled object. A path uses `goto`; an id is
assigned to `api.id` as a bare number. See `retargetToId` and `buildOrReuse` in
`src/live-api-adapter/live-api-extensions.ts`, and the header comment of
`src/live-api-adapter/live-api-release.ts` for the full measurement history.

## Alternatives rejected

**Cache objects by id across requests.** An id keeps pointing at the same Live
object even when it moves, so a cache keyed on ids looks like it should work. It
can't: a cached object has to keep a live path to stay usable, and a live path
is exactly what arms the listeners. `mode = 1` (follow the object, not the path)
was the proposed way out and measured worst of all — 5,661 ms for that same
track add and delete, nine times the mode 0 cost. Caching by id across requests
is the most expensive option available here. It also aliases: handing one
instance to two call sites breaks the moment anything retargets it.

**Build collection children by path** (`live_set tracks 0`, `tracks 1`, …)
**instead of by id.** This was the plan while id targets were believed unable to
retarget, and it is the one to stay away from now that they can. Path-based
objects follow the path; id-based ones follow the object. They diverge the
moment the Set changes underneath them, and tools do mutate mid-request —
duplicate, delete, anything that inserts or reorders. A child captured by path
before such a mutation silently refers to a _different object_ afterward.
Keeping children id-targeted avoids the question entirely.

**`freepeer()`, or letting the garbage collector handle it.** Both free the JS
peer and leave the listener armed, and the slowdown then never comes back: 7,190
objects in that state held a track add and delete at 1.0 s (freepeer) and 3.5 s
(collected) until the device was reloaded.

**`goto` for id targets.** It reports success and does the wrong thing, in two
different ways: `goto("id 2")` returns 1 and leaves the object nonexistent,
while `goto(2)` and `goto("2")` are ignored outright and leave it on its
previous target. Only the `id` property retargets, and only the bare number —
assigning `"id 2"` to it points the object at nothing.

## Consequences

Pooling does not change how the Live API behaves. Measured on 12.4.3 by running
the same `set` failure probes twice: cold, with the free list empty and every
object freshly constructed, and warm, with every object retargeted from the
pool. Identical results both ways.

A cold pass is easy to reproduce, which is worth knowing for any later probe.
`openLiveSet` (the e2e harness) re-opens the Set unconditionally and waits for
the MCP server to stop and come back — that server lives in the device, so the
device really is torn down and reloaded and the free list starts empty. Running
one file with `-t` puts the selected tests first after that reload; running the
whole file leaves the earlier tests to warm the pool.

A stale `LiveAPI` reference fails quietly rather than loudly. Straight after
release it reads as nonexistent; once recycled it points at something else, and
reads and writes land on the wrong Live object with no error. That is why the
rule is "build them where you use them" rather than "be careful."

Every silent failure mode above is read back rather than trusted — the cleared
path, and the id after a retarget. A bad id is dropped without an error and
leaves the object where it was, which under pooling means the last request's
target.

Concurrent requests don't pool. The free list only refills when no scope is
open, because there is no way to tell which request is calling, so overlapping
requests build rather than reuse. Correctness doesn't depend on this: release
fires only at zero, so no request can clear another's objects, and the free list
hands out by `pop()`, so two requests can't be given the same instance. Checked
on 12.4.3 — 200 concurrent track reads, then 150 more overlapping a
`ppal-library` call that awaits a Node RPC mid-request while holding objects,
with no crossed results either time.

The throughput cost is smaller than it sounds. Firing five reads at once came
back faster per call than running them one after another, because the client
round trip dominates and pipelines away.

The real limit is a long request, not a concurrent one. The count stays above
zero until the last scope closes, so one slow call holds _everyone's_ objects —
and their listeners — for its whole duration.

None of this makes concurrent _writes_ safe. Two agents mutating the Set at once
race in the ordinary way: read some track indices while another inserts a track,
and the later work targets the wrong one. That is the same divergence described
above under building children by path, and no object-lifetime rule can fix it.
