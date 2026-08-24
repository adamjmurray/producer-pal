# ADR-0029: An empty param is dropped from the args, not from the schema

- **Status:** Accepted
- **Date logged:** 2026-08-21

## Context

Clients fill the params they have no value for with `null` (or a blank string)
rather than leaving them out. Our schemas turn that into a value the caller
never sent:

- `z.coerce.number()` runs `Number()`, and `Number(null)` is `0` — a real index.
  A tool checking `x == null` to decide whether it was given a location then
  reads or writes track 0 instead of refusing.
- `z.coerce.string()` gives the literal `"null"` — a real name, and a second
  target beside the one the caller did name.
- A boolean, enum, or array rejects the null outright, taking the whole call
  down over a param the caller deliberately left empty. A param bounded away
  from 0 (`count`, `min(1)`) fails the same way instead of using its default.

`paramNamesSomething()` / `namedParam()` already defended the string case, but
only at the call sites that remembered to use them.

## Decision

`unsetEmptyParams()` (`src/tools/shared/tool-framework/unset-empty-params.ts`)
drops those args before validation, on every call path — MCP (`define-tool.ts`)
and REST (`rest-api-routes.ts`). A blank string survives on a text param, where
clearing a name or a clip's notes is a real request.
`src/test/meta/tool-schemas/empty-params.test.ts` pins every param of every
standard tool: `null` has to read exactly as omitting it.

`optionalParams()` in the same file does the equivalent by wrapping a schema's
shape, for the one place the args scrub can't reach — the per-query fields
nested inside `ppal-library`'s `queries`.

## Alternatives rejected

- **Make the params nullable** (`z.preprocess(blank → null, inner.nullable())`).
  Shipped briefly and reverted: it published `anyOf: [{integer}, {null}]` to the
  model and pushed `number | null` through every handler that touches an
  optional number.
- **Wrap every param's schema** in `resolveToolSchema`. Also tried: a
  `z.preprocess` wrapper hides the inner `.description` and enum `.options` from
  the outer instance, so the docs generator and the modal-config machinery both
  stopped seeing them. The JSON Schema was fine; everything reading the schema
  object directly was not. Scrubbing the args leaves every schema exactly as
  authored.
- **Wrap each param by hand at its definition.** ~114 call sites, and a new
  param silently misses out.

## Consequences

- `isCoercedNullish()` and friends still earn their keep, but only for a model
  that writes the _word_ `"null"` as a param value. A JSON null no longer
  reaches a handler.
- A param nested more than one level below the args is not covered. There is one
  such shape today and it wraps itself.
