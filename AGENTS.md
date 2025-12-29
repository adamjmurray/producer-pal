## Project Overview

Producer Pal is an AI music composition tool that integrates with Ableton Live through a Max for Live device using MCP. It bundles a Node MCP server, Max V8 adapter, a portal bridge, and a Preact/Vite Chat UI delivered as a single HTML file.

## Repo Layout & Entry Points

- MCP server: `src/mcp-server/mcp-server.js`
- Max V8 adapter: `src/live-api-adapter/live-api-adapter.js`
- Portal bridge: `src/portal/producer-pal-portal.js`
- Tools: `src/tools/**/*.js` (tool defs in `.def.js`)
- Skills: `src/skills/*.js` (exposed via workflow/connect)
- Shared utilities: `src/shared/`
- Bar/beat + modulation parsers: `src/notation/**/parser`
- Web UI (Preact/TypeScript): `webui/src/`, entry `webui/src/main.tsx`
- Tests: `src/test/`, `tests/webui/`, docs tests in `tests/docs/`
- Docs site (VitePress): `docs/`
- Claude Desktop extension: `claude-desktop-extension/`
- Max for Live assets: `max-for-live-device/Producer_Pal.amxd`, `max-for-live-device/chat-ui.html`
- Scripts: `scripts/` (CLI, builds, releases)

## Toolchain & Environment

- Node 24.x required (`type: module`). Path aliases: `#src/*`, `#webui/*`.
- Import extensions: `.js` required for `src/` and `scripts/`; omit extensions in `webui/` imports.
- Language scope: core in JavaScript; TypeScript only inside `webui/`.
- React components use PascalCase; everything else uses kebab-case with hyphens. Avoid dots in base filenames; use hyphen + suffixes (`.test`, `.def`, `.d.ts`).
- Main exported function goes first in each module; helpers follow. Null checks use `value == null`. Minimize comments; prefer self-documenting code.
- Zod schemas: primitives/enums only; lists as comma-separated strings.
- File size rules (ESLint): source ≤600 lines, tests ≤800; split helpers/tests using `{feature}-helpers.js` and `{feature}-{area}.test.js` patterns.
- Live API access should go through `src/live-api-adapter/live-api-extensions.js` helpers.
- Web UI build outputs single `max-for-live-device/chat-ui.html` via Vite single-file plugin.

## Development Workflows

- Full-stack watch: Terminal 1 `npm run dev` (watches MCP server/V8/portal); Terminal 2 `npm run ui:dev` (hot reload at http://localhost:5173). Production UI served from http://localhost:3350/chat after build.
- MCP/tools only: build UI once (`npm run build` or `npm run ui:build`), then `npm run dev` and open http://localhost:3350/chat.
- Web UI only: build MCP once (`npm run build`), then `npm run ui:dev`.
- Production build: `npm run build` (excludes raw Live API). Include raw Live API/debug tools with `npm run build:all` or `npm run dev`.

## Essential Commands

```bash
# Development builds
npm run build:all        # Full build with raw Live API debugging
npm run build            # Production bundles (rollup + ui + parsers + desktop extension)
npm run build:watch      # Build once then watch with rollup
npm run dev              # Rollup watch with raw Live API enabled

# Quality
npm run fix              # prettier write + eslint --fix
npm run check            # lint + typecheck + format check + coverage tests
npm run lint             # eslint --config config/eslint.config.js
npm run lint:fix
npm run format
npm run format:check
npm run typecheck        # alias: npm run ui:typecheck
npm run tc               # alias: npm run typecheck

# Parsing (required before tests when grammar changes)
npm run parser:build
npm run parser:watch

# Testing (Vitest)
npm test                 # runs parser:build via test:setup then vitest (dot reporter, silent)
npm run test:watch
npm run test:coverage    # alias: npm run coverage

# Web UI
npm run ui:build         # Vite build -> max-for-live-device/chat-ui.html
npm run ui:dev           # Vite dev server (raw Live API enabled)
npm run ui:typecheck     # validates webui/test TS + extension validations
npm run ui:test          # Playwright UI (needs .env)
npm run ui:test:headed
npm run ui:test:dev
npm run validate:webui-extensions

# Docs (VitePress + Playwright)
npm run docs:dev
npm run docs:build
npm run docs:preview
npm run docs:test
npm run docs:test:headed
npm run docs:test:dev

# Desktop extension
npm run dxt:clean
npm run dxt:build        # uses scripts/build-claude-desktop-extension.mjs

# Knowledge base
npm run knowledge-base   # builds coverage then generates KB
npm run kb               # alias
npm run kb:chatgpt       # concatenated output
npm run kb:small         # excludes heavy groups

# Release/version helpers
npm run version:bump[(:major|:minor)]
npm run release          # prepare release
```

## Testing Approach

- `npm test` triggers `test:setup` (rebuilds parsers) before running Vitest. Use `npm run parser:build` when editing `.peggy` grammars.
- Web UI tests use Vitest + @testing-library/preact; tests colocated with components (e.g., `ChatHeader.test.tsx`).
- Playwright suites exist for UI (`config/playwright.ui.config.mjs`) and docs (`config/playwright.docs.config.mjs`); docs tests build the site first. `.env` required for UI Playwright.
- CLI/e2e validation: `node scripts/cli.mjs tools/list` and `node scripts/cli.mjs tools/call tool-name '{"arg":"value"}'`.
- Debug logging for CLI tools: import `import * as console from "../../shared/v8-max-console.js"`; only `console.error` surfaces in CLI output (`console.log` is ignored).
- Testing conventions: mock `_id`/`_path` with `function()` (not arrows), prefer `expect.objectContaining`.

## MCP Connections & Debugging

- Preferred dev connection: `claude mcp add --transport http producer-pal http://localhost:3350/mcp` (Max for Live device running + `npm run dev`).
- Fallback CLI: `node scripts/cli.mjs`, `node scripts/cli.mjs tools/list`, `node scripts/cli.mjs tools/call ppal-read-live-set '{}'`, or specify server URL `node scripts/cli.mjs http://localhost:6274/mcp tools/list`.
- Raw Live API tool (`ppal-raw-live-api`) available only with `npm run dev` or `npm run build:all`.
- After changing tool descriptions (`src/tools/**/*.def.js`), toggle the Producer Pal Claude Desktop extension off/on to refresh cached tool definitions; rebuild alone is insufficient.

## Development Conventions & Gotchas

- Keep path alias usage consistent; avoid deep relatives when aliases exist. Always include `.js` in core imports.
- Follow naming rules (PascalCase components, kebab-case everywhere else; hyphenated suffixes). Split large files per size limits into helpers/tests under `helpers/` subfolders.
- Parser changes require rebuilding before tests. Live API access should prefer helpers in `live-api-extensions.js`.
- Docs use clean URLs (e.g., `/chat-ui`, not `/chat-ui.html`); filenames mirror folders except `docs/index.md`.
- Recommended completion flow: `npm run fix` → `npm run check` → `npm run build`.

## References

- `dev-docs/Architecture.md` – system design and component interactions
- `dev-docs/Chat-UI.md` – web UI architecture and build details
- `dev-docs/Coding-Standards.md` – naming, sizing, and style rules
- `dev-docs/Development-Tools.md` – CLI testing, raw API debugging
- `dev-docs/Documentation-Site.md` – docs workflow and deployment
- `DEVELOPERS.md` – setup and testing overview
