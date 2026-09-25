# Coding Standards

The codebase is written entirely in TypeScript (`.ts`/`.tsx` files).

## File Naming

- **React Components**: PascalCase matching the component name (e.g.,
  `ChatHeader.tsx`, `ModelSelector.tsx`)
- **All other files**: kebab-case (e.g., `use-chat.ts` in webui,
  `merge-messages.ts`, `live-api-adapter.ts` in core)

This applies throughout the codebase including hooks, utilities, configuration,
tests, and modules.

### File Suffixes

Use hyphens within base names, NOT dots. Dots are only for recognized suffixes
and file extensions:

**Allowed:**

- `arrangement-tiling.ts` - descriptive kebab-case name
- `create-clip.test.ts` - unit test (`.test` suffix)
- `create-clip.def.ts` - tool definition (`.def` suffix, tools only)
- `index.d.ts` - TypeScript declaration (`.d` suffix)

**Avoid:**

- `arrangement.tiling.ts` - uses dot instead of hyphen
- `clip.helper.ts` - uses dot instead of hyphen
- `utils.config.ts` - uses dot instead of hyphen

### Test File Naming

Test files should follow this pattern:

1. **Core tests**: `{filename}.test.ts` (or `.tsx`) - Tests for the main
   functionality of the source file
   - Example: `create-clip.test.ts` tests `create-clip.ts`
   - Example: `ChatHeader.test.tsx` tests `ChatHeader.tsx`

2. **Split tests**: `{filename}-{feature-group}.test.ts` (or `.tsx`) - When test
   files exceed size limits (375 lines for source, 650 for whole test suites),
   split by feature area
   - Example: `update-clip-audio-arrangement.test.ts`
   - Example: `read-track-drums-advanced.test.ts`
   - Example: `duplicate-arrangement-length.test.ts`

3. **Support modules**: named for what they do, not for the file they were split
   from. Existing `{filename}-helpers.ts` files are being renamed; don't add new
   ones.
   - Example: `audio-clip-warping.ts`

4. **Support module tests**: `{filename}.test.ts` beside the module
   - Example: `audio-clip-warping.test.ts`

5. **Test utilities**: `{filename}-test-helpers.ts` - Mock utilities, fixtures,
   and shared test setup. A test file (see dev/quality/Testing.md), but not a
   suite, so it keeps the 375-line source budget.
   - Example: `duplicate-test-helpers.ts`
   - Example: `update-clip-test-helpers.ts`

Those names, plus `*.spec.ts` / `*.spec.tsx` (Playwright suites in `e2e/`),
`*-test-cases.ts`, and the `test/`, `tests/`, `test-cases/`, and `test-utils/`
directories, are the project's complete definition of a test file. It lives in
`src/test/helpers/test-file-classification.ts`; do not add a category without
updating it.

### Naming Utilities and Helpers

Prefer specific, descriptive names over generic terms:

- `string-formatters.ts` instead of `string-helper.ts`
- `clip-operations.ts` instead of `clip-utils.ts`
- `message-transforms.ts` instead of `message-helper.ts`

There is no exception for `utils.ts` or `-helpers.ts`: a ratchet test
(`src/test/meta/naming/module-name-limits.test.ts`) caps how many modules may be
named for nothing, and the cap only goes down.

## Imports

Always include `.ts` extensions matching the actual file type:

```typescript
import { createMcpServer } from "../src/mcp-server/create-mcp-server.ts";
```

Peggy-generated parsers are wrapped in TypeScript files (e.g.,
`barbeat-parser.ts`) - import from the wrapper, not the `.js` file.

## Style

- Null checks: `value == null` (covers both null/undefined)
- ES6 shorthand: `{ name, color }`
- Minimize comments, prefer self-documenting code

### Index Access (`noUncheckedIndexedAccess`)

`noUncheckedIndexedAccess: true` is set in every tsconfig (`src`, `webui`,
`scripts`, `evals`, `config`, and the four `e2e/*`), so indexing an array or
record yields `T | undefined`.

Where the index is provably in range — a bounded loop, a length-checked lookup —
narrow with a commented `as T`:

```typescript
for (let i = 0; i < tracks.length; i++) {
  const track = tracks[i] as Track; // bounded by tracks.length
}
```

- **Never use `!`** — the linter forbids the non-null assertion.
- A commented `as` is for an index you can _prove_ is in range. Never delete a
  runtime guard to buy coverage — warn-and-skip is a product requirement, not
  coverage noise.

## Tools

Always pass args in `src/main.ts`:

```javascript
tools: {
  "ppal-create-clip": (args) => createClip(args),
}
```

Zod schemas: primitives/enums only. For lists, use comma-separated strings.

## Live API

Use `src/live-api-adapter/live-api-extensions.ts` instead of raw
`.get("property")?.[0]`

Return optimistic results for playback operations.

**Never hardcode Live API path strings** — build them with `livePath`.

The Live API reference is split into:

- [live-api-behavior.md](live-api-behavior.md) — what Live returns for a missing
  object, drum pad quirks, all-digit names, frozen tracks, and the song loop.
- [clip-markers.md](clip-markers.md) — how clip markers change when `warping` or
  `looping` is toggled.
- [live-api-paths.md](live-api-paths.md) — the `livePath` builders and their API
  reference.

### Rounding a Float Property for a Result

Round to display precision — the number Live's UI shows: 2dp for dB, pan, and
tempo; a device parameter uses its own display precision (already applied by
parsing its label text). Round centrally with `roundDisplayValue` from
`src/tools/shared/helpers/rounding.ts`, at the point a raw float becomes a
result field — not per site, and never on a value that still feeds arithmetic or
bar|beat conversion (beat positions, times, lengths). Max serializes some
float32 values (tiny pan, gain, or tempo noise) as an exponent-notation STRING,
not a number, so narrow with `asFiniteNumber`/`roundDisplayValue` rather than
`typeof value === "number"` alone.

## Coverage

Function coverage is enforced at **100%** via `vitest.config.ts` thresholds.

When a function is genuinely untestable (e.g., IDB error callbacks, exhaustive
`never` branches, no-op stubs, inline JSX callbacks in root components), exclude
it with `/* v8 ignore start -- reason */` ... `/* v8 ignore stop */`. Use
`start`/`stop` pairs (not `next`) because `v8 ignore next` only excludes
line/branch coverage, not function coverage.

**Rules:**

- Every `v8 ignore start` and `v8 ignore next` must include a `-- reason`
  description (enforced by test)
- `v8 ignore stop` does not need a description
- Per-tree counts are ratcheted in `src/test/lint-suppression-limits.test.ts` —
  increasing limits requires user approval
- Some functions are excluded from coverage as unreasonable to test (agreed upon
  by human and AI review)

## Testing

Use the mock registry (`src/test/mocks/mock-registry.ts`) for LiveAPI tests:

- `registerMockObject(id, { path, type, properties, methods })` — register a
  mock object and get back a `RegisteredMockObject` with instance-level
  `get`/`set`/`call` mocks
- Assert directly on the mock: `expect(track.set).toHaveBeenCalledWith(...)`
- `mockNonExistentObjects()` — make unregistered IDs non-existent (for
  invalid-ID tests)
- Domain-specific helpers (e.g., `setupTrackMock()`) wrap `registerMockObject()`
  for common object graphs

## Builds

- Dev: `npm run build:debug` (includes debugging tools)
- Prod: `npm run build` (excludes debugging)

## Design

Prefer tool description instructions over code complexity for contextual
guidance.

## Notation Grammar Duplication

### Note Values

The note-value notation (durations like `n/4`, `±n` beat offsets, the off-grid
`n<beats>/4` escape, and `<count>bar` forms) is parsed at six independent sites:

- the `barbeat-grammar.peggy` rules (authoring),
- the `transform-grammar.peggy` rules (transform expressions and time-range
  selectors), and
- three regexes in `src/notation/barbeat/time/barbeat-time.ts`
  (`durationToAbletonBeats`, `barBeatToMusicalBeats`, `parseBeatValue`).

This duplication is deliberate and **should not be refactored away**:

- Peggy has no grammar `import`/include and cannot share rule fragments between
  two grammars. The only way to share them would be a build-time
  text-concatenation step, which adds a new failure mode just to consolidate the
  stable lexer rules that rarely change (the rules that actually change during a
  reform — `beatValue`, `duration`/`nDuration` — are intentionally different per
  grammar and cannot be shared anyway).
- The TS regexes run in per-note hot paths (e.g. transform time-range
  membership), so replacing them with a full parser invocation would be a
  performance regression.
- The sites are intentionally not byte-identical: the grammars reject
  leading-zero denominators with `[1-9][0-9]*`, while the regexes use
  `0|[1-9]\d*` so a lone `0` reaches a per-site division-by-zero message.

The fraction arithmetic is already shared (`noteValueFractionToBeats()` in
`barbeat-time.ts`); only the patterns are duplicated. Two parity tests are the
enforcement mechanism — they turn silent divergence (the dangerous failure) into
a loud test failure:

- `note-value-grammar-parity.test.ts` feeds one corpus through all six parse
  sites across multiple meters and asserts identical accept/reject and matching
  values.
- `note-value-denominator-parity.test.ts` locks the serializer's
  denominator-candidate lists as subsets of the canonical
  `NOTE_VALUE_DENOMINATORS`.

When you add or change a note-value parse site, update **every** site and add it
to the parity test's site list.

### Drum-Header Pitch Names

The same situation, smaller. Stark's `DrumPitchName`
(`$([A-Ga-g] [#b]? "-"? [0-9]+)`) is respelled as `/^([A-Ga-g])([#b]?)(-?\d+)$/`
inside `stark-interpreter.ts`'s `drumHeaderPitch`, which resolves the header
arithmetically so enharmonic spellings (Cb/E#/Fb/B#) work — `pitch.ts`'s exact
table omits them and would drop the whole drum line.

`drumHeaderPitch` `assertDefined`s the match rather than null-checking it,
because the grammar is what guarantees the shape. So widening one pattern alone
— a double accidental, a Unicode ♯ — turns a header the grammar now accepts into
a thrown `Bug:` at interpret time. `drum-pitch-name-grammar-parity.test.ts` is
the lock: every header in its corpus must be rejected by the grammar or accepted
by both. It also pins the split between the two failure modes, which are not the
same — a header the user can actually mistype resolves out of MIDI range and
gets warn-and-skip (one line dropped, rest of the clip intact), while a shape
mismatch can only mean the patterns drifted.
