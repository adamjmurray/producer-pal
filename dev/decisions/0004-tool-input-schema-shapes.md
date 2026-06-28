# ADR-0004: Arrays over `string | array` unions in tool schemas

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Tool input schemas (`*.def.ts`) are consumed by many LLMs of varying capability.
A common ergonomic instinct is to accept "one or many" as `string | array` so a
caller can pass either. We probed how real models actually fill these shapes
(`evals/schema-compat/`).

## Decision

For "one or many" parameters, always use an array (a single-element array is
fine) — never `z.union([string, array])` (JSON Schema `anyOf`). Choose the shape
by the data: flat scalar lists → comma-separated string; lists of structured
records → `z.array(z.object())`; values that can contain the delimiter →
`z.array(z.string())`. Anything richer than a primitive must carry a
`smallModelModeConfig` plan.

## Alternatives rejected

- **`string | array` union** — accepted by every model but _mis-filled_: Claude
  collapses to the scalar and silently drops data; some small models
  JSON-stringify the array into the string slot. The probe measures this (e.g.
  `claude-haiku-4.5` dropped data on all 3 draws in the 2026-05-24 snapshot).
  Data loss outweighs the ergonomic win.
- **String mini-DSLs (`a=1|b=2,...`)** for structured lists — rejected; they
  have to be taught to the model and parsed by us. `z.array(z.object())` is
  understood natively.

## Consequences

- One grandfathered exception: `ppal-live-api`'s `value` param is a genuine
  heterogeneous union (per-property-typed at the call site), not a one-or-many
  shape — do not pattern-match new tools off it.
- The `evals/schema-compat/` probe + checked-in snapshot is the corroboration;
  re-run it when adding a novel shape.
- `AGENTS.md` carries the full rule table; this ADR carries the "why not union".
