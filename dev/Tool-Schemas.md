# Tool Schemas

How to shape an MCP tool's input schema, and how to give a param different text
per mode.

## Choosing a param's shape

Rich JSON Schema shapes (arrays, nested objects) are safe — every model the
`evals/schema-compat/` probe tried accepted and filled them. Pick by the data:

- **Flat list of scalars** (ids, note names, paths) → comma-separated string.
  This is the default: natural for models and cheap in tokens.
- **List of structured records** → `z.array(z.object())`. Always better than
  inventing a string mini-DSL (`a=1|b=2,...`) that has to be taught and parsed.
- **Values that can contain the delimiter** (function-call args with commas, for
  example) → `z.array(z.string())`. See `actions` in `update-device.def.ts`.
- **"One or many"** → always an array; a single-element array is fine.

**Never use `string | array`** (`z.union` → `anyOf`). Every model accepts it and
then fills it wrong: Claude collapses to the scalar and drops data, and some
small models JSON-stringify the array into the string slot.

The one grandfathered exception is `ppal-live-api`'s `value`
(`z.union([string, number, boolean, array<number>])`), because Live property
values really are heterogeneous and typed per property at the call site — the
model picks a branch based on which property it's setting, so there's no
scalar/array ambiguity. Don't copy this for new tools.

Anything richer than a primitive needs a small-model plan: either hide the param
in small-model mode (`param(schema, { default, smallModel: null })`) or keep the
schema tolerant. There's no built-in "degrade to a comma-separated string"
switch — tolerance lives in the schema, e.g. `device-params-schema.ts`'s
`params` array adds a `preprocess` that also accepts a JSON-stringified array.

## Length caps

`z.string().max(n)` emits `maxLength: n`. llama.cpp-based clients (Jan, LM
Studio, Ollama, llama-server) compile all the tool schemas into one GBNF grammar
and turn that into a `char{0,n}` repetition, which their parser rejects at 2000
or above — killing every tool call, not just the one tool.

So for a cap of 2000 or more, use `boundedString(max)` from
`src/tools/shared/tool-framework/bounded-string.ts` and put the limit in the
param description. It validates the same and emits no keyword. Smaller caps can
stay as `z.string().max()`. `src/test/meta/tool-schema-grammar-safety.test.ts`
checks every tool. Background: ADR-0021.

## Coercion

Use `z.coerce.string()` for ID params (`ids`, `trackId`, `clipId`,
comma-separated `sceneIndex`) and `z.coerce.number()` for numeric ones
(`trackIndex`, `sceneIndex`, `count`, `tempo`, `gainDb`). Models pass values as
strings or numbers interchangeably, and the MCP SDK validates before our handler
runs, so the coercion has to be at the schema level.

## Modal config: per-mode descriptions

Per-mode overrides are co-located with the param via the `param()` helper in
`src/tools/shared/tool-framework/modal-config.ts`. A param is either a plain
`z.….describe("text")` — identical in every mode — or:

```typescript
param(z.…, { default, smallModel?, "midi-json"?, stark?, "smallModel:stark"? })
```

A mode's value is one of:

- a **string** — override the description
- **`null`** — hide the param entirely
- an **object** `{ description?, excludeEnumValues? }` — trim the enum

The tool's own `description` field takes the same shapes:
`{ default, smallModel?, <notation>?, "smallModel:<notation>"? }`.

There are two axes — model size (large or `smallModel`) and notation — giving
six cells. `default` is large × bar|beat, `smallModel` is small × bar|beat, a
bare notation key (`stark`) is large × that notation, and the compound
(`"smallModel:stark"`) is small × that notation.

Resolution walks most-specific-first: `smallModel:<notation>` → `<notation>` →
`smallModel` → `default`. The first key present wins, and `null` there hides the
param. bar|beat is the default notation and has no key of its own. Only add a
compound cell when small × notation genuinely needs different text.

Use notation keys only for params whose text describes how note content is
encoded — chiefly `notes` on create-clip and update-clip. Timing and position
params (`start`, `split`, `firstStart`, `arrangementStart`, `length`) are
bar|beat in every notation.

`config.notation` reaches the tool at registration time because
`createMcpServer` runs fresh for each `POST /mcp`. Because overrides are
co-located, there are no dangling refs to guard — just keep each param's modes
correct.
