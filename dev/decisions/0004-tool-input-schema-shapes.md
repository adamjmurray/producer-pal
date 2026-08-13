# ADR-0004: Arrays over `string | array` unions in tool schemas

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Tool schemas (`*.def.ts`) are filled in by many models of varying capability.
The ergonomic instinct is to accept "one or many" as `string | array` so a
caller can pass either. We probed how models actually fill these shapes
(`evals/schema-compat/`).

## Decision

A "one or many" param is always an array; a single-element array is fine. Never
`z.union([string, array])`. `dev/Tool-Schemas.md` carries the full shape guide.

## Alternatives rejected

- **`string | array` union** — every model accepts it and then fills it wrong.
  Claude collapses to the scalar and silently drops data; some small models
  JSON-stringify the array into the string slot. In the 2026-05-24 probe
  snapshot, `claude-haiku-4.5` dropped data on all three draws.
- **String mini-DSLs (`a=1|b=2,...`)** for structured lists — they have to be
  taught to the model and parsed by us. `z.array(z.object())` is understood
  natively.

## Consequences

- One grandfathered exception: `ppal-live-api`'s `value` is a genuine
  heterogeneous union, typed per property at the call site — not a one-or-many
  shape. Don't copy it.
- The `evals/schema-compat/` probe and its checked-in snapshot are the evidence;
  re-run it when adding a novel shape.
