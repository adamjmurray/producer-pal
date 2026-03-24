# Producer Pal Development Info

Contributing to Producer Pal

I maintain the core MCP tools and feature roadmap myself to keep development
moving quickly. But there's plenty of room to collaborate:

**High-value contributions:**

- End-to-end testing automation and LLM evaluations
- Small language model optimization (making Ollama/LM Studio work better)
- Documentation improvements

**Always welcome:**

- Beta testing and detailed bug reports
- Reproducible cases where LLMs misuse the tools
- Feature requests and wishlist ideas

Interested? Open a
[GitHub discussion](https://github.com/adamjmurray/producer-pal/discussions) or
reach out directly.

Also feel free to:

- File bug reports in
  [the issues](https://github.com/adamjmurray/producer-pal/issues) (help me
  reproduce it and I will do my best to fix it)
- Ask questions, give feedback, request features, and share your experiences in
  [the discussions](https://github.com/adamjmurray/producer-pal/discussions)
- Learn from the implementation
- Fork and modify for your own needs. Please attribute me.

## Extending Producer Pal

The core is focused on Ableton Live control via MCP — each tool directly wraps
Live API calls, optimized for doing the most with the fewest tools and tokens.
The core is stabilizing, and large PRs that add new tool domains or require
external dependencies will not be accepted.

This is by design. A stable core means extensions don't break, and the
interesting innovation happens through extensions rather than a PR queue.

**There are better ways to add capabilities:**

- **Context customization** — Custom skills, system instructions, tool
  description overrides, and tool presets let you shape LLM behavior without any
  code. If you can describe a workflow in plain language, you can create a
  skill.

- **Workflows** — Pre-defined sequences of tool calls for reliable, repeatable
  operations. The LLM picks the right workflow and fills in parameters, but
  doesn't improvise the steps.

- **Companion MCP servers** — For entirely new capabilities (audio analysis,
  generative algorithms, hardware integration), build a separate MCP server. The
  LLM combines tools from all connected servers naturally. The upcoming
  `max-mcp-template` starter project and shared libraries should make this
  straightforward.

**What IS welcome as a core PR:** Bug fixes, improvements to default skill text
and tool/argument descriptions, evaluations, documentation, and targeted
optimizations to reduce cost and improve efficiency across all model types. If
you find a tweak that makes the LLM behave better, that can go straight into
core.

See the [Extending Producer Pal](https://producer-pal.org/extending)
documentation for details on extension types and how to choose between them.

## Branching Strategy

- **`main`** — latest stable release
- **`dev`** — where the next release is prepared; PRs merge here

**Which branch to work from?** You can base your work off either branch:

- **From `main`** (recommended for most contributors) — more stable starting
  point. When you're ready to merge, AI tooling can help resolve any conflicts
  with `dev`.
- **From `dev`** — gives you the latest in-progress changes, but `dev` is
  heavily iterated on and can be volatile. New conflicts may appear as it
  evolves, and it may be temporarily unstable.

## Building from source

Requires [Node.js](https://nodejs.org) (recommended v24 or higher)

1. Clone this repository
2. `npm install`
3. `npm run build` (for production) or `npm run build:debug` (for development
   with debugging tools)
4. Add the `max-for-live-device/Producer_Pal.amxd` Max for Live device to a MIDI
   track in Ableton Live
5. Drag and drop `claude-desktop-extension/Producer_Pal.mcpb` to Claude Desktop
   → Settings → Extension

**Note**: For development and testing, use `npm run build:debug` to include
debugging tools like `ppal-raw-live-api`. Use `npm run build:dev` for a normal
build with CORS enabled (for `npm run ui:dev`).

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
tested code, not just shipping faster.

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
- `npm run e2e:mcp` - Run MCP e2e tests (requires Ableton Live)
- `npx @modelcontextprotocol/inspector` - MCP protocol debugging

**Important**: After changing tool descriptions in `src/tools/**/*.def.js`, you
must toggle the Producer Pal extension off/on in Claude Desktop to refresh the
cached tool definitions.

See [Development-Tools](dev/Development-Tools.md) for the CLI tool, Raw Live API
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
