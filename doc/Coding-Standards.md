# Coding Standards

## File Naming

- **React Components**: PascalCase matching the component name (e.g.,
  `ChatHeader.jsx`, `ModelSelector.jsx`)
- **All other files**: kebab-case (e.g., `use-gemini-chat.js`,
  `merge-messages.js`, `live-api-adapter.js`)

This applies throughout the codebase including hooks, utilities, configuration,
tests, and modules.

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
