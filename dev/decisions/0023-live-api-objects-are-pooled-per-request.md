# ADR-0023: LiveAPI objects are released and pooled, never held across requests

- **Status:** Accepted
- **Date logged:** 2026-08-15

## Decision

Objects are released when the request ends and pooled for the next one; nothing
holds a `LiveAPI` across requests. Live arms a listener on every collection
along a path-based object's path and never takes it down, and construction can't
be undone short of a device reload (measurements in
`dev/live-api/performance.md`). How release and pooling work is in
`dev/live-api/object-reuse.md`.

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
