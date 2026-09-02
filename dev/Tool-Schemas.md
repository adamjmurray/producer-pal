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

## Comma-separated params pair one way

When a param varies per item, use `src/tools/shared/validation/list-pairing.ts`:
one value covers every item, N values pair 1:1 in order, anything else warns and
applies what it can. Nothing cycles.

`pairValues` / `valueForIndex` for values, `pairExact` for a destination that
holds one item — broadcasting a lone clip slot to three clips would destroy two
of them. `color` still cycles, as a documented exception; see ADR-0031.

## An empty entry means opposite things in the two kinds of list

One trailing comma is not an entry in either kind, the way most languages read a
list literal. Any other empty entry splits:

- **Target lists** name objects or places (`id`, `path`, `toPath`,
  `arrangementStart`, `locator`). Split them with `targetEntries` from
  `src/tools/shared/utils.ts`, which refuses a hole and refuses a list that
  names nothing at all (`","`). Dropping a hole shifts every later pairing and
  keeping it names nothing, so neither is guessed at. Nothing has run when the
  check fires, so refusing costs the caller only a retry.
- **Value lists** are properties applied to targets (`name`, `color`). Split
  them with `splitList`, which reads an empty entry as "no value for this one" —
  the item keeps what it had. `name: ""` alone is how you clear a value.

## Two lists in one call must agree

`validateListLengths` in `src/tools/shared/validation/list-lengths.ts`, called
once per tool before any param is split: two comma-separated params that both
name more than one entry must name the same number, or the call is refused. One
value still covers every item, and nothing cycles.

A param with a scalar item count (`count: 3`) is outside it — there's only one
list in the call — and keeps ADR-0031's warning.

Two tools can't check their raw args. update-clip's `id` and `path` name
different clips and add up, so it passes the sum as a count and never compares
the two. duplicate shares its destinations out across the sources first, so its
check (`requireSameLength`) runs where the copies are planned.

See ADR-0035.

## Params that don't apply to every action

A modal tool publishes one schema for every action, so a caller can always send
a param the chosen action has no use for. **Warn and skip it — never apply it,
never drop it quietly.** Applying it is the worse half: `ppal-playback` used to
write the arrangement playhead on `play-scene`, so "play scene 3 from bar 5"
changed the Live Set in a way nobody asked for.

Say which action ignored it, and point at every action that would have used it —
naming only one steers a caller who meant the other:

```
startTime ignored: action "play-scene" doesn't take arrangement timeline
params; use "play-arrangement" or "update-arrangement" for the playhead and loop
```

Group the params that share a reason into one warning rather than repeating the
sentence per param.

## Length caps

`z.string().max(n)` emits `maxLength: n`. llama.cpp-based clients (Jan, LM
Studio, Ollama, llama-server) compile all the tool schemas into one GBNF grammar
and turn that into a `char{0,n}` repetition, which their parser rejects at 2000
or above — killing every tool call, not just the one tool.

So for a cap of 2000 or more, use `boundedString(max)` from
`src/tools/shared/tool-framework/bounded-string.ts` and put the limit in the
param description. It validates the same and emits no keyword. Smaller caps can
stay as `z.string().max()`. `src/test/meta/tool-schemas/grammar-safety.test.ts`
checks every tool. Background: ADR-0021.

## Coercion

Use `z.coerce.string()` for ID params (`ids`, `trackId`, `clipId`,
comma-separated `sceneIndex`) and `z.coerce.number()` for numeric ones
(`trackIndex`, `sceneIndex`, `count`, `tempo`, `gainDb`). Models pass values as
strings or numbers interchangeably, and the MCP SDK validates before our handler
runs, so the coercion has to be at the schema level.

## Params sent as null, or blank

Write an optional param the plain way — nothing to remember. Clients fill the
params they have no value for with `null`, and `unsetEmptyParams()` drops those
args before validation on every call path, so a null reads as a param never
sent. Without it `Number(null)` is 0, `z.coerce.string()` gives `"null"`, and a
boolean or enum rejects the whole call. See ADR-0029.

A blank string is not the same thing. It survives on a text param, where
clearing a name or a clip's notes is a real request; on a param with no empty
value of its own — a number, boolean, enum or array — it is **refused**, naming
the param. Dropping it is what let `bpm: ""` become a call that set no tempo and
said nothing. See ADR-0035 rule 5.

Both halves are held for the whole tool surface by
`src/test/meta/tool-schemas/empty-params.test.ts`.

A param nested below the args isn't reached — wrap that shape in
`optionalParams()`, as `library-query-schema.ts` does.

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

`excludeEnumValues` means two different things depending on which mode it sits
on. On `default` it only hides the value: the JSON Schema stops offering it, but
the param still accepts it, so a caller sending a retired spelling gets the
behavior and a warning. On any other mode it also refuses the value, as defense
in depth against a small model hallucinating one it was not shown.

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

## Retiring a param

Deleting a param from `inputSchema` is not enough. `define-tool` derives the
keys it accepts from that schema, so an old caller's value gets stripped before
the handler runs and the caller is told it was ignored — a silently dropped
argument. Wrap it instead:

```typescript
toSlot: deprecatedParam(z.coerce.string().optional(), { replacedBy: "toPath" }),
```

The param stays in the schema that validates and leaves the schema that gets
published, so old callers keep working while the model never learns the name.
Sending it appends `Warning: <tool> param "toSlot" is deprecated…` to the
result.

Both MCP registration and `GET /api/tools` build their schemas through
`resolveToolSchema()` — go through it rather than filtering a schema yourself,
or the two catalogs drift.

`deprecatedParam()` and `param()` compose in either order, and their tags follow
the schema through the Zod builders — `.optional()`, `.nullable()`,
`.default()`, `.transform()`, `.refine()`, `.meta()` — so wrapping order does
not matter. Only a schema rebuilt from scratch loses them; see `schema-tags.ts`.

Removing the param for real is a breaking change: bump the minor version, and
check the shape it enabled is still rejected rather than silently falling
through to a different destination.
