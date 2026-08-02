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
   files exceed size limits (325 lines for source, 650 for whole test suites),
   split by feature area
   - Example: `update-clip-audio-arrangement.test.ts`
   - Example: `read-track-drums-advanced.test.ts`
   - Example: `duplicate-arrangement-length.test.ts`

3. **Helper files**: `{filename}-helpers.ts` - Source helper functions
   - Example: `duplicate-helpers.ts`

4. **Helper tests**: `{filename}-helpers.test.ts` - Tests for helper functions
   - Example: `duplicate-helpers.test.ts`

5. **Test utilities**: `{filename}-test-helpers.ts` - Mock utilities, fixtures,
   and shared test setup. A test file (see dev/Testing.md), but not a suite, so
   it keeps the 325-line source budget.
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

Exception: `utils.ts` is acceptable for general utilities within a specific
domain (e.g., `src/tools/shared/utils.ts`).

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

### Live API Paths — Use `livePath` Builders

**Never hardcode Live API path strings.** Use `livePath` from
`src/shared/live-api-path-builders.ts` to construct all Live API paths. Raw
strings like `"live_set tracks 0 devices 1"` and template literals like
`` `live_set tracks ${i}` `` are bug-prone, hard to refactor, and lack type
safety.

```typescript
// WRONG — hardcoded path strings
const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
const path = "live_set master_track mixer_device";

// RIGHT — use livePath builders
const track = LiveAPI.from(livePath.track(trackIndex));
const path = livePath.masterTrack().mixerDevice();
```

`LiveAPI.from()` accepts `PathLike` objects directly (no `String()` wrapping
needed). For contexts that require a `string` (computed property keys, Map
lookups, template literal concatenation), use `String(livePath.track(i))`.

#### API Reference

```
livePath.track(i)                     → TrackPath (chainable)
livePath.returnTrack(i)               → TrackPath (chainable)
livePath.masterTrack()                → TrackPath (chainable)
livePath.scene(i)                     → string
livePath.cuePoint(i)                  → string
livePath.liveSet                      → "live_set"
livePath.view.song                    → "live_set view"
livePath.view.app                     → "live_app view"
livePath.view.selectedTrack           → "live_set view selected_track"
livePath.view.selectedScene           → "live_set view selected_scene"
livePath.view.detailClip              → "live_set view detail_clip"
livePath.view.highlightedClipSlot     → "live_set view highlighted_clip_slot"

TrackPath.device(i)                   → DevicePath (chainable)
TrackPath.clipSlot(i)                 → ClipSlotPath (chainable)
TrackPath.arrangementClip(i)          → string
TrackPath.mixerDevice()               → string

DevicePath.parameter(i)               → string
DevicePath.chain(i)                   → ChainPath (chainable)
DevicePath.returnChain(i)             → ChainPath (chainable)
DevicePath.drumPad(i)                 → string

ChainPath.device(i)                   → DevicePath (chainable, enables nesting)

ClipSlotPath.clip()                   → string
```

### Audio Clip Warping

Verified against Live 12. Marker properties are beats while a clip is warped and
seconds while it is not, and toggling `warping` does **not** convert them
uniformly:

| Toggle     | `start_marker` | `loop_start` / `loop_end` | `end_marker`   | `looping`   |
| ---------- | -------------- | ------------------------- | -------------- | ----------- |
| warp → on  | converted      | converted                 | converted      | unchanged   |
| warp → off | converted      | converted                 | **left as-is** | forced to 0 |

Two consequences:

- `end_marker` is the one property Live leaves stale on unwarp.
  `unwarpAudioClip` (`src/tools/clip/helpers/audio-clip-warping.ts`) exists only
  to restate it. Nothing needs restating when warp goes on.
- An unwarped audio clip can never be looping — setting `looping` forces
  `warping` back on. So any `isLooping` branch is unreachable in an unwarped
  code path.

Conversion runs through the **warp grid**, not `beats * 60 / tempo`. On a
time-stretched clip the two differ; they only coincide when the grid happens to
match the Set tempo. Live exposes the grid as `warp_markers` but has no
`beat_to_sample_time`, so there is no cheap exact conversion.

**Known limitation:** because of that, `unwarpAudioClip` resets `end_marker` to
the whole sample rather than converting. `warping: false` combined with `start`
or `length` in the same `ppal-update-clip` call therefore loses the requested
region. Separately, `start`/`length` compute in beats and write straight to the
marker properties, so they are already wrong on an audio clip that is unwarped
to begin with.

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
`n<beats>/4` escape, and `Nbar` forms) is parsed at six independent sites:

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
