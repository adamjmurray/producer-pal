# ADR-0027: `setProperty` stays out of ppal-live-api

- **Status:** Accepted
- **Date logged:** 2026-08-19

## Decision

`ppal-live-api` has `get-property` but no `setProperty` operation, and keeps
both `set` and `set-property`. `setProperty` is reachable through `call-method`.
Its only real behavior (JSON-wrapping the routing properties) takes an object
value the tool's schema can't carry, with or without a new operation. Its
`"id X"` formatting is something `set("selected_track", "id 5")` already does.
And `set-property` vs `setProperty` is a near-identical pair a model would
struggle to keep straight.

## Rejected

- **Dropping `set-property`** (old spelling `set_property`, still accepted as a
  hidden alias). It is a documented public REST operation.
- **Making `set` echo the value.** Both do the same write, and the echo would
  only repeat the input.
