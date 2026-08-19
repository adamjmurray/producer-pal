## Project Overview

Producer Pal is an AI music composition tool that integrates with Ableton Live
through a Max for Live device using the Model Context Protocol (MCP). Written
entirely in TypeScript.

## How to Write

This applies to everything you write: code comments, docs, commit messages, and
your replies.

- **Be brief.** Say it once, in the fewest words that stay accurate. Leave out
  the history, the alternatives you rejected, and the measurements — unless a
  reader needs them to make a decision.
- **Use plain language.** Write for a human in a hurry. Prefer an ordinary word
  over a technical one, a short sentence over a clause pile. Don't write to
  prove you understood the details.
- **Shorten long comments in code you're already touching.** If a comment is
  longer than the code it explains, rewrite it smaller and plainer. Don't go
  hunting through the codebase for comments to fix — only fix what you're
  editing anyway.
- **Never cut the load-bearing part.** An assumption that causes a bug if it's
  wrong stays. So does a "don't do the obvious thing here, because X" warning.
  Trim the story around the fact, not the fact.
- **Tool descriptions and results are the tightest of all** — the Producer Pal
  Skills, `.def.ts` descriptions, and tool results all spend the user's context
  window. Keep them short, clear, and limited to what the model needs.

## Essential Commands

```bash
npm run build:debug  # dev build — always use this for development/testing

npm run fix    # auto-fix formatting and lint
npm run check  # lint + typecheck + format + tests
# npm run lint / typecheck / format / test also run individually

npm run ui:build     # chat UI production build
npm run ui:test      # stubbed webui Playwright suite (no Ableton or API keys)
npm run docs:dev     # docs site (VitePress, producer-pal.org)
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

See `dev/Architecture.md` for system design and `dev/Chat-UI.md` for the web UI.

## Critical Coding Rules

- **License headers**: every source file starts with this block (after any
  shebang). `examples/**` is exempt — those get copied into user projects.

  ```typescript
  // Producer Pal
  // Copyright (C) <year> <author>
  // AI assistance: <AI tool> (<company>)
  // SPDX-License-Identifier: GPL-3.0-or-later
  ```

  Editing an existing file: **append** yourself to the end of the `Copyright`
  list and the AI tool to the end of `AI assistance`. Both read oldest-first, so
  never reorder them.

- **File naming**: React components are PascalCase (`ChatHeader.tsx`);
  everything else is kebab-case (`use-chat.ts`).

- **Function organization**: the first exported function is the main one, named
  after the file (`updateClip()` in `update-clip.ts`). Helpers go below it.

- **No barrel files**: no `index.ts` or other pure re-export files.

- **Imports**: `src/` imports need `.ts` extensions; `webui/` never uses
  extensions. Use the `#src/`, `#webui/`, `#evals/` aliases to cross between
  top-level modules — a relative import must stay inside its own module
  (`src/notation`, `src/tools`, …), and `webui/` bans `..` entirely. Enforced by
  `src/test/meta/import-restrictions.test.ts`.

- **Null checks**: prefer `== null` over `=== null` or `=== undefined`.

- **Live API**: use the `src/live-api-adapter/live-api-extensions.ts` interface,
  not raw `.get("property")?.[0]`. Build paths with `livePath` from
  `src/shared/live-api-path-builders.ts` — never hardcode a path string. On a
  runtime `LiveAPI`, reach child objects with `api.child("name")` (chainable),
  never by concatenating onto `api.path`. Never call `new LiveAPI()` — only
  `LiveAPI.from()` tracks the object for release, and an untracked one leaves a
  Live path listener armed for the life of the device.

- **Never hold a `LiveAPI` across requests** — not in module state, not in a
  cache, not in a callback that outlives the call. Objects are released when the
  request ends and reused by the next one, so a stale reference silently points
  at a different Live object. Build them where you use them. See
  `src/live-api-adapter/live-api-release.ts`.

- **Update tools never throw** for a bad param combo or an operation that
  doesn't apply. `console.warn()`, skip that operation, and keep going, so the
  rest of a multi-item call still succeeds. Warnings are not silent — they're
  appended to the tool response as `WARNING:` blocks the model reads.

- **Tool schemas**: use `z.coerce.string()` for ID params and
  `z.coerce.number()` for numeric ones — models send both strings and numbers,
  and the MCP SDK validates before our handler runs. For choosing a param's
  shape and writing per-mode descriptions, see `dev/Tool-Schemas.md`.

- **String length caps of 2000+**: never let them reach the JSON Schema as
  `maxLength` — llama.cpp-based clients compile it into a grammar repetition and
  then reject every tool call, for every tool. Use `boundedString()` and state
  the limit in the param description. See ADR-0021.

- **The filesystem is Node-side only**: the V8 runtime (`src/live-api-adapter/`)
  has no filesystem, and shipped `src/**` can't shell out. All `node:fs` work
  lives in `src/mcp-server/`. User-content features (`~/.producer-pal`
  overrides, global context, custom system prompt) are MCP/REST concerns that
  never touch the Live API. See `dev/Architecture.md` → Runtime Boundary.

- **Generated parsers**: `generated-*-parser.js` files are gitignored and built
  from the `.peggy` grammars. Never commit them; regenerate
  (`npm run parser:build`) after editing a grammar.

- **Note-value grammar is duplicated on purpose** across both `.peggy` grammars
  and the regexes in `src/notation/barbeat/time/barbeat-time.ts` — don't extract
  a shared fragment. Parity tests hold the sites in step; adding a parse site
  means updating every site and the parity test. Same deal for Stark's
  `DrumPitchName`. See ADR-0003.

- **Exact dependency versions**: no `^`/`~`/ranges anywhere in package.json.

- **No Linear ticket references anywhere in the repo** — this is a public repo
  with private ticket numbers. Never write `AJM-NNN` in a tracked file or a
  commit message; explain the reasoning instead. `npm run check` scans both
  tracked files and your commits on this branch, but only locally, so run it
  before pushing. PR titles and bodies are fine.

- **GitHub issues go in the commit message, not the release PR body** — put
  `Resolves #NNNN` in the commit that fixes it. `dev -> main` merges onto the
  default branch, so the issue closes when the release lands. One keyword per
  issue: extra `Refs #NNNN` on supporting commits just add permanent timeline
  events to a public issue. Don't name an issue you aren't fixing.

- **Keep the Skills and specs current**: the Producer Pal Skills
  (`src/skills/fragments/`) need updating whenever notation or tool behavior
  changes under them. The grammar specs in `dev/specs/` have no test guarding
  them, so update them by hand when you change grammar syntax.

- **File size limits** (blank and comment lines don't count): 325 lines per
  source file, 650 for a whole test suite; 115 lines per function; `max-depth`
  4; `complexity` 20. When a file gets close, extract cohesive helpers into
  `{feature}-helpers.ts` beside it — don't compress code to squeak under the
  limit. Once a directory has 2+ helper files, move them into `helpers/`. Split
  test files as `{feature}-{area}.test.ts`, and give a feature its own `tests/`
  directory once it has 3+ test files. See
  `.claude/skills/refactoring/SKILL.md`.

- **Write lint suppressions with the `eslint-` prefix**, not `oxlint-`. Both
  work, but the rule requiring a `-- reason` on every directive only sees the
  `eslint-` spelling. See `dev/Linting.md`.

- **DRY**: no duplicate function bodies (oxlint catches them), keep shared
  constants in one place, and treat repeated patterns as a missing abstraction.

## Type Checking

`src/`, `scripts/`, `evals/`, and `webui/` are all type-checked. Prefer explicit
return types on exported functions. Every exported function declaration needs a
JSDoc block with `@param`/`@returns` descriptions — no types, since TypeScript
already has them.

**TypeScript 6 and 7 are installed side-by-side.** TypeScript 7 ships no
programmatic API (it's the Go port; a new API is expected in 7.1), but oxlint's
`jsPlugins` bridge needs one, so `package.json` follows the upstream-recommended
aliasing:

```json
"@typescript/native": "npm:typescript@7.0.2",
"typescript": "npm:@typescript/typescript6@6.0.2"
```

The practical consequences:

- `tsc` is **TypeScript 7** — this is what `npm run typecheck` runs. `tsc6` is
  the 6.0.2 compiler, kept only so the bridge resolves; don't typecheck with it.
- `import ts from "typescript"` gets the **6.0.2 API**, which is why
  `scripts/stats/loc.ts` and `src/test/helpers/vi-mock-scan-test-helpers.ts`
  still use the compiler API normally.
- TS 7 reports overload-mismatch errors on the **failing argument**, not the
  call expression, so a `@ts-expect-error` for one goes directly above the
  offending argument (see `duplicate-mocks-test-helpers.ts`). That placement is
  TS-7-only — `tsc6` will call it unused.
- Version pins may be npm aliases; `src/test/package-json-versions.test.ts`
  accepts `npm:<name>@<exact>` but still rejects ranges.

## Testing

- Run `npm run check` after any code change. **Before claiming done**:
  `npm run fix`, then `npm run check`, then `npm run check:build`. If you
  touched `webui/**`, also run `npm run ui:test` — `check` doesn't include it.
- `npm run build:debug` is the dev build. It force-enables the Direct Live API
  tool, code execution, and work-in-progress warp markers, none of which exist
  in a release build.
- **Debugging**: import `console` from `src/shared/max/v8-max-console.ts` and
  use `console.warn()` — it shows up in the CLI and in the live MCP response.
  `console.log()` and `console.error()` don't.
- **Coverage gaps**: `npm run check` prints totals only; the per-file breakdown
  is in `coverage/coverage-summary.txt`. Function coverage must be 100%; mark a
  genuinely untestable function with `/* v8 ignore start -- reason */`. Before
  ignoring or deleting a branch as unreachable, try to write the test — reading
  the code is not enough to prove it, and the attempt is what tells you whether
  the guard is dead or you just hadn't found the input.
- See `dev/Testing.md` for what counts as a test file, webui test gotchas, and
  the mock registry. CLI tools and test Live Sets are in
  `dev/Development-Tools.md`.

### MCP E2E Testing

E2E tests live in `e2e/mcp/` and drive a real Ableton Live. See
`e2e/mcp/README.md`.

**Always ask before running them** — they open a Live Set without saving the
current one, which can destroy work in progress.

**Always run a single file.** The full suite takes several minutes.

```bash
npm run e2e:mcp -- ppal-update-clip-arrangement-splitting
```

**A new track is not always empty.** Live applies the user's default track
preset (User Library → `Defaults/Creating Tracks/`) to every track it creates,
and that preset varies per machine — one dev's new MIDI track arrives bare,
another's already has a Channel EQ and a Utility on it. So never hardcode a
device index for a device the test just created: use `createTestDeviceAt()`,
which returns the path the device actually landed at. A test that assumes `d1`
passes for whoever wrote it and fails for everyone else. The same goes for any
other per-machine Live preference a test might lean on.

## Protected Files (Require User Approval)

These hold quality thresholds — **don't relax any of them without asking:**

- `src/test/lint-suppression-limits.test.ts` — per-tree caps on lint-disable,
  `@ts-expect-error`, and v8-ignore comments.
- `vitest.config.ts` (thresholds) — coverage.
- `config/.jscpd*.json` (`threshold`) — code duplication.

## Documentation

Internal docs live in `dev/` — the filenames are descriptive, so `ls dev/` to
find one. The main ones: `dev/Architecture.md` (system design),
`dev/Coding-Standards.md` (full style guide + Live API reference),
`dev/Testing.md`, `dev/Tool-Schemas.md`, `dev/Linting.md`, `dev/specs/`
(bar|beat and transform grammars), `dev/Development-Tools.md`, and
`dev/decisions/` (ADRs — why settled choices went the way they did, especially
the rejections).

`DEVELOPERS.md` covers dev setup; `CONTRIBUTING.md` covers contributing.
