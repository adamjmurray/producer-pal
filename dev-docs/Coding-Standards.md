# Coding Standards

## File Naming

- **React Components**: PascalCase matching the component name (e.g.,
  `ChatHeader.tsx`, `ModelSelector.tsx`)
- **All other files**: kebab-case (e.g., `use-gemini-chat.ts` in webui,
  `merge-messages.js`, `live-api-adapter.js` in core)

This applies throughout the codebase including hooks, utilities, configuration,
tests, and modules.

### File Suffixes

Use hyphens within base names, NOT dots. Dots are only for recognized suffixes
and file extensions:

**Allowed:**

- `arrangement-tiling.js` - descriptive kebab-case name
- `create-clip.test.js` - unit test (`.test` suffix)
- `create-clip.def.js` - tool definition (`.def` suffix, tools only)
- `index.d.ts` - TypeScript declaration (`.d` suffix)

**Avoid:**

- `arrangement.tiling.js` - uses dot instead of hyphen
- `clip.helper.js` - uses dot instead of hyphen
- `utils.config.js` - uses dot instead of hyphen

### Naming Utilities and Helpers

Prefer specific, descriptive names over generic terms:

- `string-formatters.js` instead of `string-helper.js`
- `clip-operations.js` instead of `clip-utils.js`
- `message-transforms.js` instead of `message-helper.js`

Exception: `utils.js` is acceptable for general utilities within a specific
domain (e.g., `src/tools/shared/utils.js`).

## Imports

Always include `.js` extensions (Node.js requirement):

```javascript
import { createMcpServer } from "../src/mcp-server/create-mcp-server.js";
```

## Style

- Null checks: `value == null` (covers both null/undefined)
- ES6 shorthand: `{ name, color }`
- Minimize comments, prefer self-documenting code

## Tools

Always pass args in `src/main.js`:

```javascript
tools: {
  "ppal-create-clip": (args) => createClip(args),
}
```

Zod schemas: primitives/enums only. For lists, use comma-separated strings.

## Live API

Use `src/live-api-extensions.js` instead of raw `.get("property")?.[0]`

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
