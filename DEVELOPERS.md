# Producer Pal Development Guide

This is the technical guide: building from source, development scripts, the
code-quality checks, and testing and debugging workflows.

For how contributions work — ways to get involved, the stable-core policy, how
to approach the strict checks pragmatically, and which branch to base your work
on — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Building from source

Requires [Node.js](https://nodejs.org) **v24 or higher** (enforced by the
`engines` field in `package.json`). Producer Pal's scripts and CLI tools run
TypeScript directly through Node's native type stripping — there is no `tsx` or
`ts-node` dependency — and rely on Node's built-in `--env-file` flag, both of
which require v24+.

1. Clone this repository
2. `npm install`
3. `npm run build` (for production) or `npm run build:debug` (for development
   with debugging tools)
4. Add the `max-for-live-device/Producer_Pal.amxd` Max for Live device to a MIDI
   track in Ableton Live
5. Drag and drop `claude-desktop-extension/Producer_Pal.mcpb` to Claude Desktop
   → Settings → Extension

**Note**: For development and testing, use `npm run build:debug` to enable
debug-only flags (`ENABLE_LIVE_API`, `ENABLE_CODE_EXEC`). `ENABLE_LIVE_API=true`
forces the runtime `liveApiEnabled` flag on so the Direct Live API tool
(`ppal-live-api`) is always available — the Setup-tab toggle cannot disable it
in this build. `POST /config { liveApiEnabled }` still works in either direction
so e2e tests can exercise both states. Chat UI development (`npm run ui:dev`)
works against any build: the MCP server reflects CORS for localhost origins by
default, so a browser page on another local port can reach it. Set
`ENABLE_REMOTE_CORS=true` before a build only if you need to reach the server
from a non-localhost browser origin (a remote inspector, or over the LAN).

## Core Development Scripts

Watch for changes and auto-build:

```
npm run dev
```

Auto-fix formatting and linting issues:

```
npm run fix  # Runs format + lint:fix
```

Code quality checks must always pass:

```
npm run check  # Runs all checks: lint + typecheck + format check + duplication + tests
```

**Recommended workflow**: Run `npm run fix` before `npm run check` to
automatically fix issues and save time.

Or run checks individually:

```
npm run lint
npm run typecheck  # UI code only
npm test
npm run format:check
npm run duplication
```

## Code Quality Checks

Producer Pal is primarily developed with AI coding agents. Without strict
automated enforcement, agents tend to accumulate tech debt: long files,
duplicated logic, suppressed warnings, and low test coverage. Regressions kept
creeping in given the wide feature surface area and open-ended nature of testing
with AI. Files grew so large agents couldn't read them in one pass. Instructions
in CLAUDE.md/AGENTS.md weren't reliably followed, so strict automated checks
were imposed.

It's expected that on some tasks, agents spend ~80% of their time making checks
pass. That's intentional — that time is spent writing better-structured, better-
tested code, not just shipping faster. If a check is blocking a contribution,
see
[Working with the strict checks](./CONTRIBUTING.md#working-with-the-strict-checks)
— these gates are for the AI agents, not to gatekeep humans.

All checks run via `npm run check` and must pass before merging:

| Check               | Tool          | What it enforces                                                                                                             |
| ------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Linting**         | ESLint        | 60+ rules including complexity limits, import ordering, TypeScript strictness, code quality (SonarJS), and style consistency |
| **Type checking**   | TypeScript    | Strict mode across all source trees (`src/`, `webui/`, `scripts/`, `evals/`, `e2e/`)                                         |
| **Formatting**      | Prettier      | Consistent code formatting                                                                                                   |
| **TypeScript-only** | Custom script | No `.js` files in `src/`, `webui/`, or `scripts/` (with narrow exceptions for generated parsers)                             |
| **Duplication**     | JSCPD         | Low duplication thresholds per source tree (see `config/.jscpd*.json`)                                                       |
| **Test coverage**   | Vitest        | High thresholds for statements, branches, and lines; 100% function coverage (see `vitest.config.ts`)                         |

Additional checks enforced within tests:

| Check                       | What it enforces                                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lint suppression limits** | Per-directory caps on `eslint-disable`, `@ts-expect-error`, `@ts-nocheck`, and `v8 ignore` comments. For example: 0 `@ts-expect-error` in `src/`, 0 `eslint-disable` in `scripts/`. Prevents suppression sprawl. |
| **v8 ignore descriptions**  | All coverage exclusion comments must include a `-- reason` explanation                                                                                                                                           |

And `npm run check:build` additionally validates:

| Check                   | What it enforces                                                                 |
| ----------------------- | -------------------------------------------------------------------------------- |
| **Production build**    | Rollup bundles (MCP server, V8, portal) and Vite UI build compile without errors |
| **Documentation build** | VitePress site compiles successfully                                             |

### Key ESLint limits

- **325 lines** max per source file (650 for test files), ignoring blanks and
  comments — prevents files from growing too large for agents to work with
  effectively
- **115 lines** max per function — forces decomposition into smaller, testable
  units
- **Depth 4** max nesting — keeps control flow readable
- **Complexity 20** — caps cyclomatic complexity

### Why so strict?

- **100% function coverage** means every function has at least one test. This
  caught regressions that slipped through with lower thresholds. A handful of
  genuinely untestable functions are excluded with `v8 ignore` comments (which
  require a reason and count against the suppression limits). Adding a new
  exception requires discussion — the AI agent is guided to raise it rather than
  silently excluding coverage.
- **Lint suppression limits** are ratcheted to current counts. Adding a new
  `eslint-disable` or `@ts-expect-error` requires fixing an existing one first
  (or getting approval to raise the limit).
- **File size limits** force agents to split code into focused modules rather
  than growing monolithic files.
- **Duplication limits** prevent copy-paste patterns that diverge over time.

The result is a codebase that's easier for both humans and AI agents to
navigate, understand, and modify safely.

## Dependency Management

All dependencies in package.json are pinned to exact versions (no `^`, `~`, or
ranges) to mitigate supply chain attacks. This is enforced at multiple levels:

- **`.npmrc`** sets `save-exact=true` so `npm install <pkg>` automatically pins
- **Automated test** in `src/test/package-json-versions.test.ts` validates every
  version matches `x.y.z` format
- **Dependabot** handles version updates with `versioning-strategy: increase`
  (bumps the pinned version in package.json, not just the lockfile)

Dependabot cooldowns add a waiting period before PRs are created for newly
released versions:

- **14-day cooldown** for minor and patch updates
- **30-day cooldown** for major version bumps
- Security updates bypass cooldowns

## Web UI Development

The chat interface is a Preact web application built with Vite.

Quick commands:

- `npm run ui:dev` - Dev server at localhost:5173 with hot reload
- `npm run ui:build` - Production build to `max-for-live-device/chat-ui.html`

See [Chat-UI](dev/Chat-UI.md) for architecture, component structure, and
detailed development workflows.

## Documentation Site

The project documentation is built with VitePress and deployed to
https://producer-pal.org.

Quick commands:

- `npm run docs:dev` - Development server with hot reload
- `npm run docs:build` - Build static site
- `npm run docs:preview` - Preview production build

**Clean URLs**: Use `/installation/chat-ui` not `/installation/chat-ui.html`.

See [Documentation-Site](dev/Documentation-Site.md) for deployment,
configuration, and content guidelines.

## Testing and Debugging

Quick commands:

- `node scripts/ppal-client.ts tools/list` - List available tools
- `node scripts/ppal-client.ts tools/call ppal-read-live-set '{}'` - Call a tool
- `npm run e2e:mcp` - Run MCP e2e tests (requires Ableton Live; the code-exec
  suite is skipped unless `ENABLE_CODE_EXEC=true` is set —
  `ENABLE_CODE_EXEC=true npm run e2e:mcp`)
- `npx @modelcontextprotocol/inspector` - MCP protocol debugging

**Important**: After changing tool descriptions in `src/tools/**/*.def.js`, you
must toggle the Producer Pal extension off/on in Claude Desktop to refresh the
cached tool definitions.

See [Development-Tools](dev/Development-Tools.md) for the CLI tool, Live API
tool, MCP Inspector setup, debugging tips, and testing workflows.

### Portal Script (Internal Testing)

The portal script (`npm/producer-pal-portal.js`) is the same script published as
the `producer-pal` npm package. For local testing before publishing to npm:

```json
"producer-pal": {
  "command": "node",
  "args": ["/absolute/path/to/npm/producer-pal-portal.js"]
}
```

## Releasing

See [Releasing](dev/Releasing.md) for the complete release process, including
version bumping, building, creating GitHub releases, testing checklists, and
publishing to npm.
