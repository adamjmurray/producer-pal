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

Exception: Peggy-generated parser files use `.js` (e.g., `barbeat-parser.js`).

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

## Testing

Mock `_id`/`_path` with `function()` (not arrow functions for `this` context).

Use `expect.objectContaining()` for assertions.

## Builds

- Dev: `npm run build:all` (includes debugging tools)
- Prod: `npm run build` (excludes debugging)

## Design

Prefer tool description instructions over code complexity for contextual
guidance.
