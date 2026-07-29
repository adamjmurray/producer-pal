## Project Overview

Producer Pal is an AI music composition tool that integrates with Ableton Live
through a Max for Live device using the Model Context Protocol (MCP). Written
entirely in TypeScript.

## Essential Commands

```bash
# Build with all tools (use this for development/testing!)
npm run build:debug

# Code quality checks
npm run fix   # Auto-fix formatting and linting issues
npm run check # All checks: lint + typecheck + format check + tests
# npm run lint / typecheck / format / test also run individually

# Chat UI development
npm run ui:build    # Production build
npm run ui:test     # Stubbed webui Playwright suite (CI-runnable, no Ableton/keys)
npm run ui:test:dev # Same suite in the Playwright UI for debugging
# Live webui suite (real device + LLM, needs Ableton + .env): npm run e2e:webui

# Documentation site (VitePress at https://producer-pal.org)
npm run docs:dev / docs:build / docs:preview
# Clean URLs: /chat-ui not /chat-ui.html (no trailing slash).
# Page files named after folder: docs/guide.md not docs/guide/index.md (except docs/index.md).
# Callouts: VitePress containers (::: tip Title / warning / info / details :::), NOT "> **Tip:**" blockquotes.
```

## Architecture

Portal script → Max for Live Device (MCP Server) → Live API

Key entry points:

- MCP Server: `src/mcp-server/mcp-server.ts`
- Max V8 code: `src/live-api-adapter/live-api-adapter.ts`
- Portal: `src/portal/producer-pal-portal.ts`
- Chat UI: `webui/src/main.tsx`
- Claude Desktop extension: `claude-desktop-extension/manifest.template.json`
- Tools: `src/tools/**/*.ts`
- Chat CLI: `evals/chat/index.ts`
- Evaluation scenarios: `evals/scenarios/index.ts`

See `dev/Architecture.md` for system design and `dev/Chat-UI.md` for web UI
architecture.

## Critical Coding Rules

- **License headers**: All source files need an SPDX header at the top (after
  any shebang). List all authors; new files use the current year and
  contributor's name. When you modify an existing file, **append** the new
  contributor to the end of the existing `Copyright` list (don't reorder or
  prepend), and likewise **append** the AI tool to the end of the
  `AI assistance` line (comma-separated if one already exists) — both lists read
  oldest-first.

  ```typescript
  // Producer Pal
  // Copyright (C) <year> <author>
  // AI assistance: <AI tool> (<company>)
  // SPDX-License-Identifier: GPL-3.0-or-later
  ```

  **Exception:** `examples/**` files are exempt from SPDX/copyright headers.
  They are reference snippets meant to be copied into user projects; headers add
  friction and confuse licensing. Do not add headers there.

- **File naming**: React components use PascalCase (`ChatHeader.tsx`); all other
  files use kebab-case (`use-chat.ts`, `live-api-adapter.ts`).

- **Function organization**: In files that export functions, the first exported
  function is the main one named after the file (e.g., `updateClip()` in
  `update-clip.ts`). All helpers (internal and exported) go below it, so the
  file's primary purpose is immediately clear.

- **Import extensions**: `src/` imports must include `.ts` extensions matching
  the actual file type (import Peggy parsers from their `.ts` wrapper, e.g.
  `barbeat-parser.ts`, not the `.js`). `webui/` is bundled and must NEVER use
  extensions in relative imports.

- **Generated parsers**: the Peggy `generated-*-parser.js` files are gitignored
  and rebuilt from the `.peggy` grammars at build time (and by
  `npm run parser:build`) — never commit them. After editing a `.peggy` grammar,
  regenerate so tests and builds pick up the change.

- **Path aliases**: Use `#src/`, `#webui/`, `#evals/` (Node.js package subpath
  imports in package.json `"imports"`). The `#` prefix is required for unbundled
  execution (build scripts, CLI tools). Never use relative `../../` when an
  alias is available.

- **No barrel files**: No index.ts or other pure re-export files. Import
  directly from the source.

- **Testing builds**: Always use `npm run build:debug` for development. It sets
  `ENABLE_LIVE_API=true` (forces `liveApiEnabled` on so the Direct Live API tool
  is always available — the Setup-tab toggle can't disable it in this build),
  `ENABLE_CODE_EXEC=true`, and `ENABLE_WARP_MARKERS=true` (work-in-progress warp
  markers: `warpMarkers` in `ppal-read-clip`'s `warp` include and the `warpOp` /
  `warpBeatTime` / `warpSampleTime` / `warpDistance` params on
  `ppal-update-clip` — absent from release builds).
  `POST /config { liveApiEnabled }` still works either direction (used by e2e to
  test the disabled state).

- **Exact dependency versions**: All package.json versions must be exact (no
  `^`/`~`/ranges). `.npmrc` enforces it for `npm install`;
  `src/test/package-json-versions.test.ts` validates it.

- **Tool input schema shapes**: Rich JSON Schema shapes (arrays, nested objects)
  are safe — accepted and filled by every model the `evals/schema-compat/` probe
  tried (see its README for the checked-in snapshot). Choose the shape by the
  data:
  - **Flat scalar list** (ids, note names, paths) → comma-separated string. The
    default: natural for LLMs, token-cheap.
  - **List of structured records** → `z.array(z.object())`. Prefer over
    inventing a string mini-DSL (`a=1|b=2,...`) that must be taught and parsed.
  - **Values that can contain the list delimiter** (e.g. function-call args with
    commas) → `z.array(z.string())`. See `actions` in `update-device.def.ts`.
  - **"One or many"** → always an array (single-element is fine). Do NOT use
    `string | array` (`z.union` → `anyOf`): accepted everywhere but mis-filled —
    Claude collapses to the scalar and drops data; some small models
    JSON-stringify the array into the string slot. **Grandfathered exception:**
    `ppal-live-api`'s `value` is
    `z.union([string, number, boolean, array<number>])` because Live property
    values are genuinely heterogeneous and per-property-typed at the call site
    (the LLM picks a branch by which property it's setting) — no scalar/array
    ambiguity. Don't pattern-match off this for new tools.
  - Anything richer than a primitive MUST have a small-model plan: either hide
    the param in small-model mode
    (`param(schema, { default, smallModel: null })`, see Modal tool config), or
    keep a small-model-tolerant schema. There is no built-in "degrade to
    comma-separated string" switch — tolerance lives in the schema (e.g.
    `device-params-schema.ts`'s `params` array adds a `preprocess` that also
    accepts a JSON-stringified array).

- **Tool schema coercion**: Use `z.coerce.string()` (not `z.string()`) for ID
  params (`ids`, `trackId`, `clipId`, comma-separated `sceneIndex`) and
  `z.coerce.number()` (not `z.number()`) for numeric params (`trackIndex`,
  `sceneIndex`, `count`, `tempo`, `gainDb`). LLMs pass values as strings or
  numbers; the MCP SDK validates before our handler runs, so coercion must be at
  the schema level.

- **Modal tool config**: Per-mode overrides for params and the tool description
  are co-located via the `param()` helper
  (`src/tools/shared/tool-framework/modal-config.ts`) — no separate
  `smallModelModeConfig` / `notationConfig` object. A param is either a plain
  `z.….describe("text")` (identical in every mode) or
  `param(z.…, { default, smallModel?, "midi-json"?, stark?, "smallModel:<notation>"? })`:
  - A mode's value is a **string** (override the description), **`null`** (hide
    the param, the old `excludeParams`), or an **object**
    `{ description?, excludeEnumValues? }` (trim enum values).
  - The tool `description` field is likewise a string or
    `{ default, smallModel?, <notation>?, "smallModel:<notation>"? }`.
  - Two axes — model size (large / `smallModel`) and notation — give 6 cells (2
    sizes × 3 notations): large×barbeat = `default`, small×barbeat =
    `smallModel`, large×notation = the bare notation (`stark`), small×notation =
    the compound (`"smallModel:stark"`).
  - Resolution walks most-specific-first (`smallModel:<notation>` → `<notation>`
    → `smallModel` → `default`); first key present wins (`null` there hides).
    `barbeat` (the default notation) has no key and falls through. Add a
    compound cell only when small×notation needs its own text.
  - Use notation keys only for params whose text describes note-content encoding
    (chiefly `notes` on create-clip / update-clip). Timing/position params
    (`start`, `split`, `firstStart`, `arrangementStart`, `length`) stay
    bar|beat.
  - `config.notation` reaches the tool at registration because `createMcpServer`
    runs fresh per `POST /mcp`. Co-location means no dangling override refs, so
    no separate refs test guards it — just keep each param's modes correct.

- **Filesystem access is Node-side only**: The V8 runtime
  (`src/live-api-adapter/`) has no filesystem and shipped `src/**` can't shell
  out (`child_process` banned). All `node:fs` reads/writes live on the
  Node-for-Max side (`src/mcp-server/`). User-content / config features
  (`~/.producer-pal` overrides, global context, custom system prompt) are pure
  MCP/REST concerns — they do NOT use the Live API. Content that must reach
  external MCP clients is injected into the `ppal-connect` result Node-side (the
  append seam in `helpers/global-context/global-context-inject.ts`), never in a
  V8 tool handler that can't read the files. The webui round-trips through Node
  REST routes for the same reason. See `dev/Architecture.md` → Runtime Boundary.

- **Live API**: Always use the `src/live-api-adapter/live-api-extensions.ts`
  interface instead of raw `.get("property")?.[0]` calls.

- **Live API paths**: Never hardcode path strings — use `livePath` from
  `src/shared/live-api-path-builders.ts` (e.g. `livePath.track(i)`).
  `LiveAPI.from()` accepts `PathLike` objects. See `dev/Coding-Standards.md`.

- **Runtime sub-paths**: With a runtime `LiveAPI`, use `api.child("name")`
  (chainable, multi-arg) for child objects — never concatenate
  `api.path + " name"` back through `LiveAPI.from()`. E.g.
  `track.child("mixer_device").child("panning")`.

- **Null checks**: Prefer `== null` over `=== null` or `=== undefined`.

- **Update tool error handling**: Update tools (update-clip, update-track,
  update-device, …) must NOT throw for invalid param combos or incompatible
  operations. Instead `console.warn()`, skip the operation, and continue — this
  allows partial successes across multiple items. `console.warn()` is NOT
  silent: it's relayed to the LLM as `WARNING:` text blocks appended to the tool
  response (emitted on outlet 1 by `src/shared/v8-max-console.ts`, collected by
  `src/mcp-server/max-api-adapter.ts`), so warn-and-skip is real, actionable
  feedback. (`console.log()`/`console.error()` are NOT relayed.) E.g.
  `console.warn("quantize parameter ignored for audio clip")`.

- **No Linear ticket references in the repo**: Public repo, private ticket
  numbers. Never write an `AJM-NNN` reference in any tracked file (comments,
  docs, test names) or commit/PR text — explain the reasoning directly. Enforced
  by `src/test/meta/no-linear-refs.test.ts` for tracked files and for the commit
  messages in `origin/main..HEAD` (the set a squash merge pastes into public
  history). The commit scan is local-only — CI checks out shallow and has no
  base ref to diff against — so run `npm run check` before pushing. PR titles
  and bodies stay unguarded.

- **Producer Pal Skills maintenance**: Returned by the ppal-connect tool
  (`src/tools/core/connect.ts`). Adjust it after bar|beat notation changes and
  when changing behavior that invalidates any of its instructions.

- **Notation spec maintenance**: The hand-written grammar specs in `dev/specs/`
  (`BarBeat-Spec.md`, `Transforms-Spec.md`) are the authoritative reference for
  the bar|beat and transform DSLs. No test guards them and they don't feed the
  docs site (built from the skills strings), so they drift silently — update by
  hand whenever you change grammar syntax (operators, selectors, shorthand,
  range bounds like `N|*`/`-<`, note-value tokens, units — say "musical beats"
  vs the internal Ableton quarter-note beat). Keep them focused on the
  grammar/parser contract; defer usage examples to the skills.

- **Notation grammar duplication**: The note-value lexer (durations like `n/4`,
  `±n` beat offsets, the off-grid `n<beats>/4` escape, `Nbar` forms) is
  intentionally duplicated across both Peggy grammars (`barbeat-grammar.peggy`,
  `transform-grammar.peggy`) and the regexes in
  `src/notation/barbeat/time/barbeat-time.ts`. Peggy has no rule-sharing and
  routing per-note hot paths through the parser would cost performance, so do
  NOT extract a shared fragment. Enforced by `note-value-grammar-parity.test.ts`
  (6 parse sites across meters) and `note-value-denominator-parity.test.ts` —
  when adding/changing a parse site, update every site AND the parity test.
  Stark's `DrumPitchName` is duplicated the same way as a regex in
  `stark-interpreter.ts`'s `drumHeaderPitch`, locked by
  `drum-pitch-name-grammar-parity.test.ts`. See `dev/Coding-Standards.md` for
  the rationale.

- **Context window usage optimization**: The Producer Pal Skills, `.def.ts` tool
  and parameter descriptions, and tool results must be very short, clear, and
  focused on the most useful info.

- **IndexedDB versioning**: IndexedDB is schemaless for record data — adding
  fields to stored records does NOT need a version bump; handle missing fields
  with defaults on read. Only bump `DB_VERSION` for structural changes
  (creating/deleting object stores or indexes). Prefer backwards-compatible
  reads over upgrade-time data transforms.

- **Chat UI builds**: The webui is built with Vite (`config/vite.config.ts`)
  into a single self-contained `max-for-live-device/chat-ui.html`. Use
  `npm run ui:build` to check the build succeeds.

- **UI testing**: Webui tests use vitest + @testing-library/preact, colocated
  with source (`ChatHeader.tsx` → `ChatHeader.test.tsx`).

- **Webui tests must not leak real fetches**: Under
  `@vitest-environment happy-dom` the page origin is `http://localhost:3000`, so
  any unmocked same-origin `fetch` hits the real network and surfaces as
  `ECONNREFUSED`. These leaks are invisible in plain `npm test` (the process
  exits before slow polls fire) and only appear under `npm run check` /
  `test:coverage`. Any test mounting a component that does same-origin `fetch`
  on mount or a timer must mock the transport. Tests rendering the real `<App>`
  must mock `use-system-prompt` and `ContextTabs` (the `use-doc.ts` hooks fetch
  on mount AND on a 5s poll) — reuse the shared payloads in
  `webui/src/components/tests/App-context-mocks.tsx` rather than re-inlining.

- **File organization and size limits** (numeric oxlint limits under Refactoring
  & Code Quality):
  - When a file approaches the limit, extract helpers to `{feature}-helpers.ts`
    in the same directory; group by feature/domain. If a helper file exceeds the
    limit, split by group: `{feature}-{group}-helpers.ts` (e.g.
    `update-clip-audio-helpers.ts`).
  - When a directory accumulates 2+ helper files, move them to a `helpers/`
    subdirectory (keep the main source file in the parent).
  - Split test files with dot notation: `{feature}-{area}.test.ts`. Shared test
    utilities go in `{feature}-test-helpers.ts`.
  - **Test file location**: Create a `tests/` subdirectory once 3+ test files
    exist for a feature; fewer may be colocated or in `tests/` (either is fine).
  - **Prefer refactoring over trimming**: extract cohesive helpers rather than
    compressing code (merging tests into loops, collapsing whitespace,
    shortening names, inlining helpers) to stay under a limit.

## Test File Classification

A file is a **test file** if it matches: `*.test.{ts,tsx}`, `*-test-helpers.ts`,
`*-test-case.ts`, or lives in a `tests/`, `test-cases/`, or `test-utils/`
directory.

Implications:

- **Duplication**: higher threshold (3%) vs source code (0.3%).
- **Line limits**: only `*.test.*` and `*-test-case.ts` get 650 lines max; test
  helpers use the standard 325.
- **Coverage**: test helpers are excluded from coverage requirements.

## Type Checking

All of `src/`, `scripts/`, `evals/`, `webui/` is type-checked via
`npm run typecheck`. Code must pass `typecheck` and `lint`. Prefer explicit
return types on exported functions. Every exported function declaration needs a
JSDoc block with `@param`/`@returns` descriptions (no types — TypeScript is the
source of truth). The block's presence is enforced by
`src/test/meta/jsdoc-requirements.test.ts`, since oxlint has no require-jsdoc
rule; oxlint checks that an existing block is complete. Before committing,
`npm run check` must pass with zero errors.

## Testing After Changes

- After ALL code changes: run `npm run check` (lint + typecheck + format +
  tests).
- **Before claiming done**: ALWAYS run `npm run fix`, then `npm run check`, then
  `npm run check:build` (verifies production artifacts and docs site compile).
  This pre-empts likely errors. **If you touched the chat UI** (`webui/**` or
  its build): ALSO run `npm run ui:test` (the stubbed Playwright suite;
  `npm run check` doesn't run it — no Ableton/keys needed).
- **Debug logging**: import console
  (`import * as console from "../../shared/v8-max-console.ts"`) and use
  `console.warn()` — it's relayed as a `WARNING:` block in both the CLI and the
  live MCP response (the LLM sees it); `console.log()`/`console.error()` are
  not. Invaluable for tracing tool behavior when CLI-testing AND when debugging
  e2e tests.
- **Diagnosing coverage gaps**: `npm run check`'s console shows only totals —
  check `coverage/coverage-summary.txt` for the per-file breakdown. Function
  coverage is enforced at 100%; if a function is genuinely untestable use
  `/* v8 ignore start -- reason */` (see `dev/Coding-Standards.md` Coverage).
- **Needs user approval** (never do unprompted): raising v8-ignore limits,
  raising duplication thresholds, or lowering coverage thresholds — see
  Protected Files.
- CLI tool invocation (`scripts/ppal-client.ts`), reproducible test Live Sets,
  and LLM-based e2e (`scripts/chat -1`) are documented in
  `dev/Development-Tools.md`.

## MCP E2E Testing

E2E tests for MCP tools are in `e2e/mcp/`; they open Ableton Live and verify
tools via the MCP protocol. See `e2e/mcp/README.md` for prerequisites/patterns.

**IMPORTANT:** Always ask the user before running e2e tests — they open a Live
Set without saving the current one, which can destroy in-progress work in
Ableton Live.

**IMPORTANT:** Always run a single test file (the full suite takes several
minutes). Pass a matcher after `--`:

```bash
npm run e2e:mcp -- ppal-update-clip-arrangement-splitting  # single file
npm run e2e:mcp                                             # full suite (avoid unless requested)
```

## Project Constraints

- TypeScript for `src/`, `scripts/`, `evals/`, `webui/`.
- Three rollup bundles: MCP server (Node.js), V8 code (Max), and the MCP
  stdio-to-http "portal".
- Dependencies bundled for distribution.

## Protected Files (Require User Approval)

These hold code-quality thresholds — **do not relax without asking first:**

- `src/test/lint-suppression-limits.test.ts` — per-tree limits for lint-disable
  (either the `eslint-` or `oxlint-` prefix), @ts-expect-error, and v8 ignore
  comments.
- `vitest.config.ts` (thresholds section) — test coverage thresholds.
- `config/.jscpd*.json` (`threshold`) — code-duplication limits (per tree).

## Refactoring & Code Quality

See `.claude/skills/refactoring/SKILL.md` for comprehensive guidelines. When
oxlint reports violations, consult it for strategies.

Key oxlint limits (all ignoring blank/comment lines):

- `max-lines-per-function`: 120. Exception: a webui hook's main `useHook()` may
  use `oxlint-disable-next-line max-lines-per-function` (not a whole-file
  disable).
- `max-lines` per file: 325 for source, 650 for `*.test.*` and `*-test-case.ts`.
- `max-depth`: 4. `complexity`: 20.

**DRY**: no duplicate function bodies (caught by oxlint), extract repeated
logic, keep shared constants in one place; similar patterns suggest a missing
abstraction.

## Documentation

Internal design docs live in `dev/` — filenames are descriptive, so `ls dev/` to
find the right one. Key entries: `dev/Architecture.md` (system design),
`dev/Coding-Standards.md` (full code-style + Live API reference),
`dev/decisions/` (ADRs — the "why" behind settled choices, esp. rejections),
`dev/Linting.md` (oxlint config, what moved to meta tests, what was lost),
`dev/specs/` (bar|beat

- transform grammar specs), `dev/Development-Tools.md` (CLI/e2e testing tools).
  `DEVELOPERS.md` = dev setup and testing; `CONTRIBUTING.md` = contribution
  guide (ways to contribute, stable-core policy, branching).
