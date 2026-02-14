# Coding Standards

The codebase is written entirely in TypeScript (`.ts`/`.tsx` files).

## File Naming

- **React Components**: PascalCase matching the component name (e.g.,
  `ChatHeader.tsx`, `ModelSelector.tsx`)
- **All other files**: kebab-case (e.g., `use-gemini-chat.ts` in webui,
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
   files exceed size limits (600 lines for source, 800 for tests), split by
   feature area
   - Example: `update-clip-audio-arrangement.test.ts`
   - Example: `read-track-drums-advanced.test.ts`
   - Example: `duplicate-arrangement-length.test.ts`

3. **Helper files**: `{filename}-helpers.ts` - Source helper functions
   - Example: `duplicate-helpers.ts`

4. **Helper tests**: `{filename}-helpers.test.ts` - Tests for helper functions
   - Example: `duplicate-helpers.test.ts`

5. **Test utilities**: `{filename}-test-helpers.ts` - Mock utilities and shared
   test setup (NOT a test file itself)
   - Example: `duplicate-test-helpers.ts`
   - Example: `update-clip-test-helpers.ts`

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

- Dev: `npm run build:all` (includes debugging tools)
- Prod: `npm run build` (excludes debugging)

## Design

Prefer tool description instructions over code complexity for contextual
guidance.
