# CLAUDE.md

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

```
Claude Desktop → Desktop Extension Bridge → MCP Server (Node.js) → Max for Live Device → Live API
```

Key entry points:

- MCP Server: `src/mcp-server/mcp-server.js`
- V8 code: `src/live-api-adapter/live-api-adapter.js`
- Tools: `src/tools/**/*.js`

See `doc/Architecture.md` for detailed system design.

## Critical Coding Rules

- **Always pass args to tool functions**: Use `(args) => toolFunction(args)`
  pattern in `src/live-api-adapter/live-api-adapter.js`, never
  `() => toolFunction()`

- **Import extensions**: Always include `.js` in imports

- **Testing builds**: Always use `npm run build:all` for development (includes
  debugging tools like `ppal-raw-live-api`)

- **Zod limitations**: Use only primitive types and enums. For list-like inputs,
  use comma-separated strings

- **Live API**: Use `src/live-api-adapter/live-api-extensions.js` interface
  instead of raw `.get("property")?.[0]` calls

- **Null checks**: Prefer `== null` over `=== null` or `=== undefined`

- **Playback state**: Return optimistic results for playback operations (don't
  rely on immediate state reads)

## Testing After Changes

- **Tool descriptions changed**: Toggle Producer Pal extension off/on in Claude
  Desktop
- **Code changes**: Run `npm test`
- **End-to-end validation**: Use CLI tool (see `docs/Development-Tools.md`)
- **Before committing**: Run `npm run format`

## Project Constraints

- JavaScript only (no TypeScript) due to embedded environment
- Node.js 20, Live 12.2, Max 9
- Two rollup bundles: MCP server (Node.js) and V8 code (Max)
- Dependencies bundled for distribution

## Documentation

- `doc/Architecture.md` - System design and components
- `doc/Coding-Standards.md` - Code style, patterns, and rules
- `doc/Development-Tools.md` - CLI testing, raw API debugging, MCP inspector
- `DEVELOPERS.md` - Development setup and testing
- `FEATURES.md` - Complete feature list
