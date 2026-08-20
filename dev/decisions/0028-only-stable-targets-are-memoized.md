# ADR-0028: Only stable targets are memoized within a request

- **Status:** Accepted
- **Date logged:** 2026-08-19

## Context

Tools resolve the same target many times in one request. Reading a Live Set
resolves `live_set` once per clip to get the Set's scale, and `this_device` once
per track to find the host. Each repeat takes another object off the pool, and
when the pool is empty it builds one — the expensive thing, since construction
registers a context in MxDCore that only a device reload takes back (ADR-0023).

Remembering what a target resolved to, for the length of one request, would make
the repeats free. Nothing about that breaks the "nothing holds a `LiveAPI`
across requests" rule: the memo is emptied at the same moment tracked objects
are released.

## Decision

A request may reuse an object it already resolved, but only for these targets:

    live_app, live_app view, live_set, live_set master_track,
    live_set view, this_device

Each names one object that exists for as long as the Live Set does. Nothing a
tool, a user, or a concurrent request can do repoints any of them.

Everything else resolves afresh every time, exactly as it did before. Repeats of
anything else are removed where they happen, by resolving once and passing the
object down.

See `STABLE_TARGETS` and `buildOrReuse` in
`src/live-api-adapter/live-api-build.ts`.

## Alternatives rejected

**Memoize by id.** An id keeps naming the same Live object, so it looks like the
safest key of the two. It is the least safe. At mode 0 an id resolves to a path
once and follows that path afterward, so after a mutation it can name a
different object than a fresh lookup of the same id would. Delete depends on
exactly that difference: `confirmDeleted` re-looks-up the id to find out whether
Live went through with the delete, because the object the delete ran through
still reports its old id and path. Memoizing ids makes every delete report that
Live refused it.

**Memoize any path.** A path-based object follows its path, so a remembered one
answers what a fresh one would _as long as nothing changes underneath it_. Tools
change things underneath it constantly, and then read the same path again to
find out what happened. `copyClipToSlot` reads the destination slot's clip id,
calls `duplicate_clip_to`, and re-reads the same path to tell a real copy from
the clip that was already sitting there; handing back the first object turns
every copy into "no clip landed". Measured against the test suite, this breaks 8
files.

**Memoize any path, and invalidate on mutation.** The version above, made safe
by emptying the memo whenever something changes. Rejected because there is no
complete list of mutations to hook:

- Method calls could be caught, with a wrapper the tools call instead of
  `.call()` and a meta test to keep them honest. That part works.
- Property writes can't. Writing `selected_track`, `selected_scene`,
  `detail_clip`, or `highlighted_clip_slot` changes what a _path_ names with no
  method call involved.
- Neither covers the user editing the Set while a request is in flight, and
  requests do overlap (ADR-0023).

So the guarantee is really "we think we found them all", it has to keep holding
for every call site anyone adds later, and getting it wrong reads the wrong Live
object with no error anywhere. Measured on the tools unit suite, this catches
about four times as many repeats as the stable-target list — not worth buying
with an invariant nobody can check.

**A memo of read values rather than objects** (the Set's scale mask, say). The
object memo already removes the expensive half, since resolving the target is
what costs; the remaining property reads are cheap. Adding one would need its
own invalidation for the writes that change those values, for very little.

## Consequences

A hit is checked with `exists()` before it is handed back, so a Live version
that stops resolving one of these paths costs a rebuild rather than a wrong
answer.

Adding to `STABLE_TARGETS` is the one way to get this wrong, which is why the
list is short, alphabetical, and sitting under the reasoning. A path with an
index in it is never eligible. Neither is a view pointer like
`live_set view selected_track`, which names whatever is selected right now.

Re-registering a mock object mid-test empties the memo, because that is a test
saying the Live Set changed underneath the code. Without it, a test that
re-registers `live_set` to stand for a Save-As would keep reading the old
registration.

`ppal-live-api` empties the memo on the way in and on the way out. It is the
only caller that retargets an object in place — `goto`, `set_path`, `set_id`,
`set_mode`, `freepeer` — so it must not be handed one the rest of the request is
sharing, and must not leave a retargeted one behind under the path it started
from.
