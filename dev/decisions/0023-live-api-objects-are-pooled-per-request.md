# ADR-0023: LiveAPI objects are released and pooled, never held across requests

- **Status:** Accepted
- **Date logged:** 2026-08-15

## Decision

Live arms a listener on every collection along a path-based `LiveAPI` object's
path and never takes it down, so held objects slow down the whole Live Set
(measurements in `dev/live-api/performance.md`). Constructing objects is also
costly and can't be undone short of a device reload.

So objects are tracked as built and released when the request ends (mode reset
to 0, path cleared, onto a free list the next request retargets). Nothing holds
a `LiveAPI` across requests. A stale reference fails quietly: just after release
it reads as nonexistent, and once recycled it points at a different Live object,
with no error. Hence "build them where you use them".

Both path and id targets retarget a pooled object (`retargetToId`,
`buildOrReuse` in `src/live-api-adapter/live-api-extensions.ts`). The free-list
cap is sized above the largest single request, since a cap that is too small
hands memory back only to rebuild it on the next call. Silent failures (the
cleared path, the id after a retarget) are read back, not trusted. A bad id is
dropped without an error and leaves the object on the last request's target.

## Rejected

- **Caching objects by id across requests.** An id follows the object when it
  moves, so it looks safe. But a cached object needs a live path to stay usable,
  and a live path is what arms the listeners. `mode = 1` (follow the object)
  measured worst of all. Sharing one cached instance across call sites also
  aliases as soon as anything retargets it.
- **Building collection children by path** (`live_set tracks 0`). Path objects
  follow the path, id objects follow the object. After a mid-request mutation
  (duplicate, delete, insert, reorder) a path-built child silently refers to a
  different object. Build children by id.
- **`freepeer()` or letting the garbage collector handle it.** Both free the JS
  peer and leave the listener armed, so the slowdown stays until the device is
  reloaded.
- **`goto` for id targets.** It reports success and does the wrong thing:
  `goto("id 2")` returns 1 and leaves the object nonexistent, and `goto(2)` /
  `goto("2")` are ignored. Only `api.id = N` with a bare number works. Assigning
  `"id 2"` to it points the object at nothing.

## Limits

- Concurrent requests don't pool: the free list refills only when no request is
  open. Correctness holds: release fires only at zero, and the free list hands
  out each object once.
- One slow request holds everyone's objects, and their listeners, until it
  finishes.
- Concurrent writes from two agents still race on Set structure. No
  object-lifetime rule fixes that.
