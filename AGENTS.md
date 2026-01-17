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

# Documentation site (VitePress at https://producer-pal.org)
npm run docs:dev     # Development server with hot reload
npm run docs:build   # Build static site
npm run docs:preview # Preview production build
# When editing docs, use clean URLs: /chat-ui not /chat-ui.html (no trailing slash)
# Page files named after folder: docs/guide.md not docs/guide/index.md (except top-level docs/index.md)
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

See `dev-docs/Architecture.md` for detailed system design and
`dev-docs/Chat-UI.md` for web UI architecture.

## Critical Coding Rules

- **File naming**: React components use PascalCase (e.g., `ChatHeader.tsx`). All
  other files use kebab-case (e.g., `use-gemini-chat.ts`, `live-api-adapter.js`)

- **Function organization**: In files that export functions, the first exported
  function should be the main function named after the file (e.g.,
  `updateClip()` in `update-clip.js`, `readTrack()` in `read-track.js`). All
  helper functions (both internal and exported) must be placed below the main
  exported function(s). This improves code readability and makes it immediately
  clear what the primary purpose of each file is.

- **Import extensions**: Code in `src/` and `scripts/` directories runs
  unbundled in Node.js and must ALWAYS include `.js` file extensions in relative
  imports (e.g., `import foo from './bar.js'`), as required by the Node.js ESM
  loader. Code in `webui/` is bundled and must NEVER use file extensions in
  relative imports (e.g., `import foo from './bar'`).

- **Path aliases**: Use `#src/` for src imports (e.g.,
  `import foo from '#src/shared/utils.js'`) and `#webui/` for webui imports
  (e.g., `import { App } from '#webui/components/App'`). Both use Node.js
  package subpath imports configured in package.json `"imports"` field. The `#`
  prefix is required by Node.js for unbundled execution (build scripts, CLI
  tools). Never use relative paths like `../../` when a path alias is available.

- **No barrel files**: Do not create index.js or other files that only re-export
  from other modules. Import directly from the source file instead.

- **Testing builds**: Always use `npm run build:all` for development (includes
  debugging tools like `ppal-raw-live-api`)

- **Zod limitations**: Use only primitive types and enums in tool input schemas.
  For list-like inputs, use comma-separated strings

- **Live API**: Use `src/live-api-adapter/live-api-extensions.js` interface
  instead of raw `.get("property")?.[0]` calls

- **Null checks**: Prefer `== null` over `=== null` or `=== undefined`

- **Update tool error handling**: Update tools (update-clip, update-track,
  update-device, etc.) should NOT throw errors for invalid parameter
  combinations or incompatible operations. Instead:
  - Emit a warning via `console.error()` with prefix "Warning:" or tool name
  - Skip the operation and continue processing
  - This allows partial successes when updating multiple items
  - Example:
    `console.error("Warning: quantize parameter ignored for audio clip")`

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

- **File organization and size limits**:
  - Max 600 lines per file for source files (enforced by ESLint)
  - Max 800 lines per file for test files (enforced by ESLint)
  - When a file approaches the limit, extract helpers to `{feature}-helpers.js`
    in the same directory (e.g., `update-clip-helpers.js`)
  - Helper files group related utility functions by feature/domain (e.g., audio
    operations, content analysis, clip duplication)
  - If a helper file exceeds 600 lines, split by feature group:
    `{feature}-{group}-helpers.js` (e.g., `update-clip-audio-helpers.js`,
    `update-clip-midi-helpers.js`)
  - When a directory accumulates multiple helper files (2+), move them to a
    `helpers/` subdirectory while keeping the main source file in the parent
    directory
  - Test files split using dot notation: `{feature}-{area}.test.js` (e.g.,
    `update-clip-audio-arrangement.test.js`, `duplicate-validation.test.js`)
  - Test helpers use `{feature}-test-helpers.js` for shared test utilities
  - **Test file location**: Use colocated tests (same directory as source) for
    1-2 test files. Create a `tests/` subdirectory when 3+ test files exist for
    a feature to keep the main directory focused on source code

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
- Direct tool invocation (upon request):
  ```
  node scripts/cli.mjs tools/list
  node scripts/cli.mjs tools/call tool-name '{"arg": "value"}'
  ```
- **LLM-based e2e testing**: Use `scripts/chat` to test tools via an LLM
  (verifies the AI can use tools correctly, not just that tools work):
  - Run `scripts/chat --help` to see available options
  - Always use `-1` (or `--once`) to exit after one response
  - Example: `scripts/chat -p gemini -1 "list tracks in the set"`
- **Debug logging for CLI testing**:
  - `console` must be imported:
    `import * as console from "../../shared/v8-max-console.js"`
  - Use `console.error()` to see output in CLI tool results (appears as WARNING)
  - `console.log()` does NOT appear in CLI output
- Before claiming you are done: ALWAYS run `npm run fix` (auto-fixes formatting
  and linting issues), then `npm run check` (validates all checks pass), then
  `npm run build` (verifies all production artifacts compile successfully). This
  saves time and tokens by pre-emptively fixing likely errors before validation.
- **Diagnosing coverage gaps**: If coverage thresholds fail, check
  `coverage/coverage-summary.txt` for per-file breakdown (console only shows
  totals). Look for files with low coverage percentages to identify what needs
  tests.

## Project Constraints

- JavaScript for core project, TypeScript (.ts/.tsx) for webui source files
- Three rollup bundles: MCP server (Node.js), V8 code (Max), and MCP
  stdio-to-http "portal"
- Dependencies bundled for distribution

## Refactoring & Code Quality

See `.claude/skills/refactoring/SKILL.md` for comprehensive refactoring
guidelines.

Key ESLint limits to respect:

- `max-lines-per-function`: 120 (ignoring blank/comment lines)
  - allowed exceptions: the main useHook() function in webui hooks can be
    excluded from this rule via
    `eslint-disable-next-line max-lines-per-function` comments (do not disable
    for the whole file)
- `max-lines` per file:
  - 325 for non-test files (ignoring blank/comment lines)
  - 750 for test files (total lines including blank/comment)
- `max-depth`: 4
- `complexity`: 20

When ESLint reports violations, consult the refactoring skill for strategies.

### DRY (Don't Repeat Yourself)

Rules:

- No duplicate function bodies (caught by ESLint)
- Extract repeated logic with too many identical lines
- Shared constants in one place
- Similar patterns suggest missing abstraction

## Documentation

- `dev-docs/Architecture.md` - System design and components
- `dev-docs/Chat-UI.md` - Web UI architecture and development
- `dev-docs/Coding-Standards.md` - Code style, patterns, and rules
- `dev-docs/Development-Tools.md` - CLI testing, raw API debugging, MCP
  inspector
- `dev-docs/Documentation-Site.md` - VitePress documentation site setup and
  deployment
- `DEVELOPERS.md` - Development setup and testing
