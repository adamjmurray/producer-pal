## Project Overview

Producer Pal is an AI music composition tool that integrates with Ableton Live
through a Max for Live device using the Model Context Protocol (MCP). The
codebase is written entirely in TypeScript.

## Essential Commands

```bash
# Build with all tools (use this for development/testing!)
npm run build:debug

# Code quality checks
npm run fix   # Auto-fix formatting and linting issues
npm run check # Run all checks: lint + typecheck + format check + tests
npm run lint
npm run typecheck
npm run format
npm test

# Chat UI development
npm run ui:build   # Production build
npm run ui:test    # Stubbed, CI-runnable webui Playwright suite (no Ableton/keys)
npm run ui:test:dev # Same suite in the Playwright UI for debugging
# The live webui suite (real device + LLM, needs Ableton + .env) is `npm run e2e:webui`

# Documentation site (VitePress at https://producer-pal.org)
npm run docs:dev     # Development server with hot reload
npm run docs:build   # Build static site
npm run docs:preview # Preview production build
# When editing docs, use clean URLs: /chat-ui not /chat-ui.html (no trailing slash)
# Page files named after folder: docs/guide.md not docs/guide/index.md (except top-level docs/index.md)
# Callouts: use VitePress containers (::: tip Title / ::: warning / ::: info / ::: details ... :::), NOT plain "> **Tip:**" blockquotes
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

See `dev/Architecture.md` for detailed system design and `dev/Chat-UI.md` for
web UI architecture.

## Critical Coding Rules

- **License headers**: All source files must have an SPDX license header at the
  top (after any shebang). Format:

  ```typescript
  // Producer Pal
  // Copyright (C) <year> <author>
  // AI assistance: <AI tool> (<company>)
  // SPDX-License-Identifier: GPL-3.0-or-later
  ```

  List all authors who contributed to the file. New files should include the
  current year and the contributor's name. When AI tools modify a file, add the
  AI assistance line (e.g., `// AI assistance: Claude (Anthropic)`). If an AI
  assistance line already exists, append additional tools as a comma-separated
  list (e.g., `// AI assistance: Gemini (Google), Claude (Anthropic)`).

  **Exception: `examples/**`** — files under `examples/` are intentionally
  exempt from SPDX/copyright headers. They are reference snippets meant to be
  copied freely into user projects, and the headers would add friction and
  potentially confuse users about licensing. Do not add SPDX headers to files in
  this directory.

- **File naming**: React components use PascalCase (e.g., `ChatHeader.tsx`). All
  other files use kebab-case (e.g., `use-chat.ts`, `live-api-adapter.ts`)

- **Function organization**: In files that export functions, the first exported
  function should be the main function named after the file (e.g.,
  `updateClip()` in `update-clip.ts`, `readTrack()` in `read-track.ts`). All
  helper functions (both internal and exported) must be placed below the main
  exported function(s). This improves code readability and makes it immediately
  clear what the primary purpose of each file is.

- **Import extensions**: Code in `src/` must include `.ts` file extensions in
  imports matching the actual file type (e.g., `import foo from './bar.ts'`).
  Peggy-generated parsers are wrapped in TypeScript files (e.g.,
  `barbeat-parser.ts`) - import from the wrapper, not the `.js` file. Code in
  `webui/` is bundled and must NEVER use file extensions in relative imports
  (e.g., `import foo from './bar'`).

- **Path aliases**: Use `#src/` for src imports (e.g.,
  `import foo from '#src/shared/utils.ts'`), `#webui/` for webui imports (e.g.,
  `import { App } from '#webui/components/App'`), and `#evals/` for evals
  imports (e.g.,
  `import { runScenario } from '#evals/scenarios/run-scenario.ts'`). All use
  Node.js package subpath imports configured in package.json `"imports"` field.
  The `#` prefix is required by Node.js for unbundled execution (build scripts,
  CLI tools). Never use relative paths like `../../` when a path alias is
  available.

- **No barrel files**: Do not create index.ts or other files that only re-export
  from other modules. Import directly from the source file instead.

- **Testing builds**: Always use `npm run build:debug` for development. It sets
  `ENABLE_LIVE_API=true` (forces the runtime `liveApiEnabled` flag on so the
  Direct Live API tool is always available — the Setup-tab toggle cannot disable
  it in this build), `ENABLE_CODE_EXEC=true`, and `ENABLE_DEV_CORS=true`.
  `POST /config { liveApiEnabled }` still works in either direction (used by e2e
  tests to exercise the disabled state).

- **Exact dependency versions**: All versions in package.json must be exact (no
  `^`, `~`, or ranges). `.npmrc` enforces this for `npm install`. A test in
  `src/test/package-json-versions.test.ts` validates it.

- **Tool input schema shapes**: Rich JSON Schema shapes (arrays, nested objects)
  are safe to use — accepted and filled by every model the probe tried.
  (`ppal-live-api` already ships `z.array(z.object(...))`; the
  `evals/schema-compat/` probe spot-checks one model per provider across 3 draws
  at provider-default temperature, with a checked-in results snapshot in
  `evals/schema-compat/README.md` — corroboration, not exhaustive proof.) Choose
  the shape by the data:
  - **Flat scalar list** (ids, note names, paths) → comma-separated string.
    Still the default: natural for LLMs, token-cheap, no reason to change
    existing ones.
  - **List of structured records** (e.g. per-item fields) →
    `z.array(z.object())`. Prefer this over inventing a string mini-DSL
    (`a=1|b=2,...`) that has to be taught and parsed.
  - **Values that can contain the list delimiter** (e.g. function-call args with
    commas) → `z.array(z.string())`, not a comma-separated string. See `actions`
    in `update-device.def.ts`.
  - **"One or many"** → always use an array (a single-element array is fine). Do
    NOT use `string | array` (`z.union` → JSON Schema `anyOf`): it is accepted
    everywhere but mis-filled — Claude collapses to the scalar and drops data;
    some small models JSON-stringify the array into the string slot. (The
    probe's `string-or-array-union` check now asserts the lossless array branch
    with both items present, so the collapse-to-scalar failure is measured, not
    just eyeballed: in the 2026-05-24 snapshot `claude-haiku-4.5` returned
    `{"action":"reverse"}` on all 3 draws — dropping data — while Gemini,
    GPT-5-nano, and Mistral used the array.) **Grandfathered exception:**
    `ppal-live-api`'s `value` param is
    `z.union([string, number, boolean, array<number>])` because Live property
    values are genuinely heterogeneous (one property takes a string, another a
    number, another a number-list). The parameter is per-property-typed at the
    call site (the LLM picks one branch based on which property it's setting),
    not a "one-or-many" shape — there is no scalar/array ambiguity for any given
    property. Don't pattern-match off this for new tools.
  - Anything richer than a primitive MUST have a `smallModelModeConfig` plan:
    either exclude the param (`excludeParams`), or keep it with a
    small-model-tolerant schema. There is no built-in "degrade to a
    comma-separated string" switch — the tolerance lives in the schema. Example:
    the `params` array in `device-params-schema.ts` adds a `preprocess` that
    also accepts a JSON-stringified array (absorbing the small-model habit of
    stringifying structured args) alongside a `descriptionOverrides` entry.

- **Tool schema coercion**: Use `z.coerce.string()` instead of `z.string()` for
  ID parameters in tool input schemas (e.g., `ids`, `trackId`, `clipId`,
  `sceneIndex` when it accepts comma-separated values). Use `z.coerce.number()`
  instead of `z.number()` for numeric parameters (e.g., `trackIndex`,
  `sceneIndex`, `count`, `tempo`, `gainDb`). This allows LLMs to pass values as
  either strings or numbers (like `id: 123` or `trackIndex: "3"`) which Zod
  automatically coerces. The MCP SDK validates schemas before our handler runs,
  so coercion must happen at the schema level.

- **Small model mode**: When modifying tool definitions (`.def.ts` files) —
  adding, removing, or renaming parameters, or changing descriptions — check
  whether corresponding changes are needed in the `smallModelModeConfig`
  (`excludeParams`, `descriptionOverrides`, `toolDescription`).

- **Live API**: Always use `src/live-api-adapter/live-api-extensions.ts`
  interface instead of raw `.get("property")?.[0]` calls

- **Live API paths**: Never hardcode path strings. Use `livePath` from
  `src/shared/live-api-path-builders.ts` for all Live API paths (e.g.,
  `livePath.track(i)` not `` `live_set tracks ${i}` ``). `LiveAPI.from()`
  accepts `PathLike` objects directly. See `dev/Coding-Standards.md` for the
  full API reference.

- **Runtime sub-paths**: When you have a runtime `LiveAPI` and need a child
  object, use `api.child("name")` (chainable, multi-arg supported) — never
  concatenate `api.path + " name"` and pass it back through `LiveAPI.from()`.
  Example: `track.child("mixer_device").child("panning")` instead of
  `LiveAPI.from(LiveAPI.from(track.path + " mixer_device").path + " panning")`.

- **Null checks**: Prefer `== null` over `=== null` or `=== undefined`

- **Update tool error handling**: Update tools (update-clip, update-track,
  update-device, etc.) should NOT throw errors for invalid parameter
  combinations or incompatible operations. Instead:
  - Emit a warning via `console.warn()`
  - Skip the operation and continue processing
  - This allows partial successes when updating multiple items
  - These warnings are NOT silent: `console.warn()` output is relayed back to
    the LLM as `WARNING:` text blocks appended to the MCP tool response (emitted
    on outlet 1 by `src/shared/v8-max-console.ts`, collected into the response
    by `src/mcp-server/max-api-adapter.ts`). So warn-and-skip is real,
    actionable feedback the model can recover from — not a hidden no-op.
    (`console.log()` and `console.error()` are NOT relayed.)
  - Example: `console.warn("quantize parameter ignored for audio clip")`

- **Producer Pal Skills maintenance**: This is returned in the ppal-connect tool
  in `src/tools/core/connect.ts`. It needs to be adjusted after changes to
  bar|beat notation and when changing behavior that invalidates any of its
  instructions.

- **Notation spec maintenance**: The hand-written grammar specs in `dev/specs/`
  (`BarBeat-Spec.md`, `Transforms-Spec.md`) are the authoritative reference for
  the bar|beat and transform DSLs. No test guards them and they do NOT feed the
  generated docs site (that is built from the skills strings), so they drift
  silently — update them by hand whenever you change grammar syntax: operators,
  selectors, shorthand forms, range bounds (e.g. the `N|*`/`-<` half-open
  selectors), note-value tokens, or units (always say "musical beats" vs the
  internal Ableton quarter-note beat). Keep the specs focused on the
  grammar/parser contract and defer usage examples to the skills.

- **Notation grammar duplication**: The note-value lexer (durations like `n/4`,
  `±n` beat offsets, the off-grid `n<beats>/4` escape, and `Nbar` forms) is
  intentionally duplicated across both Peggy grammars (`barbeat-grammar.peggy`,
  `transform-grammar.peggy`) and the regexes in
  `src/notation/barbeat/time/barbeat-time.ts`. Peggy has no import/rule-sharing,
  and routing the per-note hot paths through the generated parser would cost
  performance, so do NOT extract a shared grammar fragment. The contract is
  enforced by `note-value-grammar-parity.test.ts` (6 parse sites across multiple
  meters) and `note-value-denominator-parity.test.ts`. When adding or changing a
  note-value parse site, update every site AND register it in the parity test.
  See `dev/Coding-Standards.md` for the full rationale.

- **Context window usage optimization**: The Producer Pal Skills, tool and
  parameter descriptions in `.def.ts` files, and tool results need to be very
  short, clear, and focused on the most useful and relevant info.

- **IndexedDB versioning**: IndexedDB is schemaless for record data — adding new
  fields to stored records does NOT require a version bump. Handle missing
  fields with sensible defaults when reading. Only bump `DB_VERSION` for
  structural changes (creating/deleting object stores or indexes). Avoid
  migration code that iterates and transforms existing records; prefer
  backwards-compatible reads over upgrade-time data transforms.

- **Chat UI builds**: The webui is built with Vite (config in
  `config/vite.config.ts`) and outputs a single self-contained
  `max-for-live-device/chat-ui.html` file. Use `npm run ui:build` to check the
  UI build succeeds.

- **UI testing**: Webui tests use vitest + @testing-library/preact. Tests are
  colocated with source files (e.g., `ChatHeader.tsx` has `ChatHeader.test.tsx`
  in the same directory).

- **File organization and size limits**:
  - Max 325 lines per file for source files (ESLint, ignoring blanks/comments)
  - Max 650 lines for `*.test.*` and `*-test-case.ts` (ESLint, ignoring
    blanks/comments)
  - When a file approaches the limit, extract helpers to `{feature}-helpers.ts`
    in the same directory (e.g., `update-clip-helpers.ts`)
  - Helper files group related utility functions by feature/domain (e.g., audio
    operations, content analysis, clip duplication)
  - If a helper file exceeds 325 lines, split by feature group:
    `{feature}-{group}-helpers.ts` (e.g., `update-clip-audio-helpers.ts`,
    `update-clip-midi-helpers.ts`)
  - When a directory accumulates multiple helper files (2+), move them to a
    `helpers/` subdirectory while keeping the main source file in the parent
    directory
  - Test files split using dot notation: `{feature}-{area}.test.ts` (e.g.,
    `update-clip-audio-arrangement.test.ts`, `duplicate-validation.test.ts`)
  - Test helpers use `{feature}-test-helpers.ts` for shared test utilities
  - **Test file location**: Create a `tests/` subdirectory when 3+ test files
    exist for a feature to keep the main directory focused on source code. Fewer
    than 3 test files may be colocated or in `tests/` — either is fine, but
    `tests/` is unnecessary until there are at least 3
  - **Prefer refactoring over trimming**: When adding code would exceed file
    limits, extract cohesive groups of logic into helper files rather than
    artificially compressing code (e.g., merging tests into loops, collapsing
    whitespace, shortening variable names, inlining helpers). The goal of limits
    is smaller, focused files — not clever formatting tricks to stay under the
    line count

## Test File Classification

A file is classified as a **test file** if it matches any of these patterns:

- `*.test.{ts,tsx}` - Unit/integration tests
- `*-test-helpers.ts` - Shared test utilities
- `*-test-case.ts` - Test data fixtures (webui)
- Files in `tests/` directories
- Files in `test-cases/` directories
- Files in `test-utils/` directories

**Implications of test file classification:**

- **Duplication limits**: Higher threshold (3%) vs source code (0.3%)
- **Line limits**: Only `*.test.*` and `*-test-case.ts` files get 650 lines max
  (ignoring blanks/comments); test helpers use the standard 325 line limit
- **Coverage**: Test helpers excluded from coverage requirements

## Type Checking

**Scope:** All source code is type-checked via `npm run typecheck`:

- `src/`, `scripts/`, `evals/`, and `webui/` use TypeScript (`.ts`/`.tsx` files)

**Requirements:**

- All code must pass: `npm run typecheck`
- All code must pass: `npm run lint`
- Prefer explicit return types on exported functions

**Scripts JSDoc convention:** ESLint enforces JSDoc on all function declarations
in scripts. Add `@param` and `@returns` descriptions (without types) to all
functions for clarity.

**Before committing:** `npm run check` must pass with zero errors

## Testing After Changes

- After ALL code changes: Run `npm run check` (runs lint, typecheck, format
  check, and tests)
- Direct tool invocation (upon request):
  ```
  node scripts/ppal-client.ts tools/list
  node scripts/ppal-client.ts tools/call tool-name '{"arg": "value"}'
  ```
- **Diagnosing with test Live Sets**: When debugging tool behavior with
  `scripts/ppal-client`, use the test Live Sets from `e2e/live-sets/` and
  `evals/live-sets/` as reproducible test scenarios. Open one with
  `scripts/open-live-set path/to/set.als`. Add `console.warn()` calls to trace
  execution (these appear as WARNING in CLI output). After any writes modify the
  Live Set state, reopen it with `scripts/open-live-set` to reset back to the
  original state.
- **LLM-based e2e testing**: Use `scripts/chat` to test tools via an LLM
  (verifies the AI can use tools correctly, not just that tools work):
  - Run `scripts/chat --help` to see available options
  - Always use `-1` (or `--once`) to exit after one response
  - Example:
    `scripts/chat -m google/gemini-2.0-flash -1 "list tracks in the set"`
- **Debug logging for CLI testing**:
  - `console` must be imported:
    `import * as console from "../../shared/v8-max-console.ts"`
  - Use `console.warn()` to surface output: it is relayed as a `WARNING:` block
    in the tool result in BOTH the CLI and the live MCP response (the LLM sees
    it — see the Update tool error handling note above)
  - `console.log()` and `console.error()` do NOT appear in CLI output or the MCP
    response
- Before claiming you are done: ALWAYS run `npm run fix` (auto-fixes formatting
  and linting issues), then `npm run check` (validates all checks pass), then
  `npm run check:build` (verifies production artifacts and docs site compile
  successfully). This saves time and tokens by pre-emptively fixing likely
  errors before validation.
  - **If you touched the chat UI** (`webui/**` or its build): ALSO run
    `npm run ui:test` (the stubbed Playwright suite — `npm run check` does not
    run it, since it is slower than the unit tests). It needs no Ableton or API
    keys. The live `e2e:webui` suite stays manual.
- **Diagnosing coverage gaps**: If coverage thresholds fail, check
  `coverage/coverage-summary.txt` for per-file breakdown (console only shows
  totals). Look for files with low coverage percentages to identify what needs
  tests. Function coverage is enforced at 100% — if a function is genuinely
  untestable, use `/* v8 ignore start -- reason */` (see
  `dev/Coding-Standards.md` Coverage section for rules). Increasing v8 ignore
  limits requires user approval.

## MCP E2E Testing

E2E tests for MCP tools are in `e2e/mcp/`. These tests open Ableton Live and
verify tools via the MCP protocol.

**IMPORTANT:** Always ask the user before running e2e tests. E2e tests open a
Live Set without saving the current one, which can destroy in-progress work in
Ableton Live. Never run them without confirmation.

**IMPORTANT:** Always run a single test file, not the full suite. The full suite
takes several minutes. Pass a matcher after `--` to target a specific file:

```bash
npm run e2e:mcp -- ppal-update-clip-arrangement-splitting
```

**Commands:**

- `npm run e2e:mcp -- <matcher>` - Run a single e2e test file
- `npm run e2e:mcp` - Run all MCP e2e tests (avoid unless explicitly requested)

**Adding tests:** See `e2e/mcp/README.md` for prerequisites and patterns.

## Project Constraints

- TypeScript for `src/`, `scripts/`, `evals/`, and `webui/`
- Three rollup bundles: MCP server (Node.js), V8 code (Max), and MCP
  stdio-to-http "portal"
- Dependencies bundled for distribution

## Protected Files (Require User Approval)

The following files contain code quality thresholds that should only be relaxed
with explicit user approval. **Do not modify these values without asking
first:**

- `src/test/lint-suppression-limits.test.ts` - Per-tree limits for
  eslint-disable, @ts-expect-error, and v8 ignore comments. Increasing these
  limits weakens code quality enforcement.

- `vitest.config.ts` (thresholds section) - Test coverage thresholds. Lowering
  these allows coverage to drop.

If a change requires relaxing these limits, ask the user for approval before
making the modification.

## Refactoring & Code Quality

See `.claude/skills/refactoring/SKILL.md` for comprehensive refactoring
guidelines.

Key ESLint limits to respect:

- `max-lines-per-function`: 120 (ignoring blank/comment lines)
  - allowed exceptions: the main useHook() function in webui hooks can be
    excluded from this rule via
    `eslint-disable-next-line max-lines-per-function` comments (do not disable
    for the whole file)
- `max-lines` per file (ignoring blank/comment lines):
  - 325 for source files
  - 650 for `*.test.*` and `*-test-case.ts` files
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

- `dev/Architecture.md` - System design and components
- `dev/Arrangement-Operations.md` - Live API constraints, arrangement
  algorithms, and edge cases
- `dev/Chat-UI.md` - Web UI architecture and development
- `dev/Conversation-Branching.md` - Conversation forking (edit/retry), sibling
  branch navigation, and history-panel family collapse
- `dev/Coding-Standards.md` - Code style, patterns, and rules
- `dev/decisions/` - Architecture Decision Records: the "why" behind settled
  choices, especially deliberate rejections ("won't fix" / "cancelled")
- `dev/Development-Tools.md` - CLI testing, raw API debugging, MCP inspector
- `dev/Documentation-Site.md` - VitePress documentation site setup and
  deployment
- `dev/Read-Tool-Includes.md` - Read tool include parameter system and
  conventions
- `dev/Specialized-Devices.md` - Specialized device LOM classes, pseudo-param
  mappings, and the probe-against-Live verification discipline
- `DEVELOPERS.md` - Development setup and testing
