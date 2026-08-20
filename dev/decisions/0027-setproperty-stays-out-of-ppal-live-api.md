# ADR-0027: `setProperty` stays out of ppal-live-api

- **Status:** Accepted
- **Date logged:** 2026-08-19

## Context

`ppal-live-api` exposes `getProperty`, the wrapper's read helper, but not
`setProperty`, its write counterpart. The asymmetry looks like an oversight, and
the tool's `set` / `set_property` pair looks like duplication worth resolving at
the same time. Both have been proposed.

## Decision

`setProperty` does not get an operation. `set` and `set_property` both stay.

## Alternatives rejected

**Add a `setProperty` operation.**

- It is already reachable. `call_method` runs `api[method].apply(api, args)`, so
  `{"type":"call_method","method":"setProperty","args":["selected_track","5"]}`
  works today.
- Its only substantial behavior is out of reach either way. `setProperty`
  JSON-wraps the four routing properties, and real callers pass an object
  (`{identifier: N}`). The tool's `value` schema is
  `string|number|boolean|number[]` and `args` is `(string|number|boolean)[]` —
  neither accepts an object. A dedicated operation would need the same schema
  widening `call_method` would.
- Its `"id X"` formatting is thin: it fires only on a digits-only _string_, so a
  number falls straight through, and `set("selected_track", "id 5")` is the
  exact equivalent.
- The symmetry with `getProperty` doesn't hold. `getProperty` earns its place
  because its _default_ case unwraps every property Live returns array-wrapped —
  and turns the `1` sentinel into `undefined`. `setProperty`'s default case is a
  bare passthrough to `set`. They are symmetric in name only.
- It costs a third name in the `set` family, where `set_property` and
  `setProperty` differ by one underscore. That is the worst kind of
  near-duplicate for a model to keep straight, in a description already at
  length.

**Drop `set_property` as a duplicate of `set`.** It is a documented public REST
operation, so removing it breaks callers to save one enum entry.

**Make `set` echo the value, so `set_property` becomes redundant.** `set`
already returns something: the number `1`. Both operations perform the identical
write, and neither return is informative — the echo only repeats the input, and
the `1` is a constant. See `dev/Coding-Standards.md` → "What Live Returns When
There Is No Object".

## Consequences

The wrapper's write path stays available through `call_method` for anyone
debugging it, without a second spelling of "set" in the operation list.

Whether the tool should carry wrapper helpers at all — `getProperty`,
`getChildIds`, `exists`, `getColor`, `setColor` are all reachable via
`call_method` too — is a separate, open question about the tool's surface. This
ADR settles only the write helper.
