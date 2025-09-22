## Project Overview

Producer Pal is an AI music composition tool that integrates with Ableton Live
through a Max for Live device using the Model Context Protocol (MCP).

## Essential Commands

```bash
# Build with all tools (use this for development/testing!)
npm run build:all

# Run tests
npm test
npm run test:coverage

# Code formatting
npm run format

# Parser rebuild (when modifying bar|beat grammar)
npm run parser:build
```

## Architecture

Portal script → Max for Live Device (MCP Server) → Live API

Key entry points:

- MCP Server: `src/mcp-server/mcp-server.js`
- Max V8 code: `src/live-api-adapter/live-api-adapter.js`
- Portal: `src/portal/producer-pal-portal.js`
- Claude Desktop extension: `claude-desktop-extension/manifest.template.json`
- Tools: `src/tools/**/*.js`

See `doc/Architecture.md` for detailed system design.

## Critical Coding Rules

- **Import extensions**: Always include `.js` in imports

- **Testing builds**: Always use `npm run build:all` for development (includes
  debugging tools like `ppal-raw-live-api`)

- **Zod limitations**: Use only primitive types and enums in tool input schemas.
  For list-like inputs, use comma-separated strings

- **Live API**: Use `src/live-api-adapter/live-api-extensions.js` interface
  instead of raw `.get("property")?.[0]` calls

- **Null checks**: Prefer `== null` over `=== null` or `=== undefined`

- **Playback state**: Return optimistic results for playback operations (don't
  rely on immediate state reads)

## Testing After Changes

- After ALL code changes: Run `npm test`
- End-to-end validation and investigation (upon request):
  ```
  node scripts/cli.mjs tools/list
  node scripts/cli.mjs tools/call tool-name '{"arg": "value"}'
  ```
- Before claiming you are done: ALWAYS run `npm run format`

## Project Constraints

- JavaScript only (no TypeScript)
- Three rollup bundles: MCP server (Node.js), V8 code (Max), and MCP
  stdio-to-http "portal"
- Dependencies bundled for distribution

## Documentation

- `doc/Architecture.md` - System design and components
- `doc/Coding-Standards.md` - Code style, patterns, and rules
- `doc/Development-Tools.md` - CLI testing, raw API debugging, MCP inspector
- `DEVELOPERS.md` - Development setup and testing
