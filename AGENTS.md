## Project Overview

Producer Pal is an AI music composition tool that integrates with Ableton Live
through a Max for Live device using the Model Context Protocol (MCP).

## Essential Commands

```bash
# Build with all tools (use this for development/testing!)
npm run build:all

# Code quality checks
npm run fix   # Auto-fix formatting and linting issues
npm run check # Run all checks: lint + typecheck + format check + tests
npm run lint
npm run typecheck
npm run format
npm test

# Parser rebuild (when modifying bar|beat grammar)
npm run parser:build

# Chat UI development
npm run ui:build # Production build
```

## Architecture

Portal script → Max for Live Device (MCP Server) → Live API

Key entry points:

- MCP Server: `src/mcp-server/mcp-server.js`
- Max V8 code: `src/live-api-adapter/live-api-adapter.js`
- Portal: `src/portal/producer-pal-portal.js`
- Chat UI: `webui/src/main.tsx`
- Claude Desktop extension: `claude-desktop-extension/manifest.template.json`
- Tools: `src/tools/**/*.js`

See `doc/Architecture.md` for detailed system design and `doc/Chat-UI.md` for
web UI architecture.

## Critical Coding Rules

- **File naming**: React components use PascalCase (e.g., `ChatHeader.tsx`). All
  other files use kebab-case (e.g., `use-gemini-chat.ts`, `live-api-adapter.js`)

- **Import extensions**: Always include `.js` in imports

- **Testing builds**: Always use `npm run build:all` for development (includes
  debugging tools like `ppal-raw-live-api`)

- **Zod limitations**: Use only primitive types and enums in tool input schemas.
  For list-like inputs, use comma-separated strings

- **Live API**: Use `src/live-api-adapter/live-api-extensions.js` interface
  instead of raw `.get("property")?.[0]` calls

- **Null checks**: Prefer `== null` over `=== null` or `=== undefined`

- **Producer Pal Skills maintenance**: This is returned in the ppal-connect tool
  in `src/tools/workflow/connect.js`. It needs to be adjusted after changes to
  bar|beat notation and when changing behavior that invalidates any of its
  instructions.

- **Context window usage optimization**: The Producer Pal Skills, tool and
  parameter descriptions in `.def.js` files, and tool results need to be very
  short, clear, and focused on the most useful and relevant info.

- **Chat UI builds**: The webui is built with Vite (config in
  `config/vite.config.mjs`) and outputs a single self-contained
  `max-for-live-device/chat-ui.html` file. Use `npm run ui:build` to check the
  UI build succeeds.

- **UI testing**: Webui tests use vitest + @testing-library/preact. Tests are
  colocated with source files (e.g., `ChatHeader.tsx` has `ChatHeader.test.tsx`
  in the same directory).

## TypeScript (WebUI Only)

**Scope:** TypeScript is ONLY used in `webui/` directory.

**Requirements:**

- All webui code must pass: `npm run typecheck`
- All webui code must pass: `npm run lint`
- Prefer explicit return types on exported functions

**Before committing:** `npm run check` must pass with zero errors

## Testing After Changes

- After ALL code changes: Run `npm run check` (runs lint, typecheck, format
  check, and tests)
- End-to-end validation and investigation (upon request):
  ```
  node scripts/cli.mjs tools/list
  node scripts/cli.mjs tools/call tool-name '{"arg": "value"}'
  ```
- **Debug logging for CLI testing**:
  - `console` must be imported:
    `import * as console from "../../shared/v8-max-console.js"`
  - Use `console.error()` to see output in CLI tool results (appears as WARNING)
  - `console.log()` does NOT appear in CLI output
- Before claiming you are done: ALWAYS run `npm run fix` (auto-fixes formatting
  and linting issues), then `npm run check` (validates all checks pass). This
  saves time and tokens by pre-emptively fixing likely errors before validation.

## Project Constraints

- JavaScript for core project, TypeScript (.ts/.tsx) for webui source files
- Three rollup bundles: MCP server (Node.js), V8 code (Max), and MCP
  stdio-to-http "portal"
- Dependencies bundled for distribution

## Documentation

- `doc/Architecture.md` - System design and components
- `doc/Coding-Standards.md` - Code style, patterns, and rules
- `doc/Development-Tools.md` - CLI testing, raw API debugging, MCP inspector
- `DEVELOPERS.md` - Development setup and testing
