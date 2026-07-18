# Producer Pal Development Info

Contributions are welcome, and this guide is here to make them easy — not to
gatekeep. Producer Pal has unusually strict automated checks, but they exist to
keep AI coding agents honest, not to raise the bar for humans. If a check is
getting in your way, there's almost always a pragmatic path through it (see
[Working with the strict checks](#working-with-the-strict-checks)), and when in
doubt, open a
[discussion](https://github.com/adamjmurray/producer-pal/discussions) and ask.

## Ways to contribute

There's room to get involved at every level of experience and commitment:

- **Use it and talk about it.** Beta testing, feature requests, and sharing your
  experiences in
  [the discussions](https://github.com/adamjmurray/producer-pal/discussions) all
  shape where the project goes.
- **File bug reports** in
  [the issues](https://github.com/adamjmurray/producer-pal/issues) — help me
  reproduce it and I will do my best to fix it. Reproducible cases where LLMs
  misuse the tools are especially valuable.
- **Improve the documentation.** Typo fixes to full guides, all welcome.
- **Make the LLMs behave better.** Skills, tool descriptions, system
  instructions, and [evals](evals/README.md) that demonstrate improvements —
  including small language model optimization (making Ollama/LM Studio work
  better).
- **Strengthen the testing.** End-to-end testing automation and LLM evaluations
  are high-value areas with lots of open ground.
- **Build extensions.** Custom skills, the REST API, and Agent Skills for coding
  agents are where a lot of the interesting innovation happens — see
  [Extending Producer Pal](#extending-producer-pal).
- **Learn from the implementation**, or fork and modify for your own needs
  (please attribute me).

One thing worth knowing before you start a large PR: the core toolset is
deliberately kept stable, so adding new tools or changing tool shapes needs
discussion first. See [Extending Producer Pal](#extending-producer-pal) below —
it explains why, and points to the many areas that are wide open.

Interested in any of this? Open a
[GitHub discussion](https://github.com/adamjmurray/producer-pal/discussions) or
reach out directly.

## Working with the strict checks

Producer Pal is developed primarily with AI coding agents, and the strict,
automated code-quality gates (see [Code Quality Checks](#code-quality-checks))
exist to combat "AI slop" — the long files, duplicated logic, suppressed
warnings, and untested branches that agents accumulate when nothing stops them.
It works remarkably well, and it's a big part of why the codebase stays
navigable for humans and agents alike. It is **not** meant to gatekeep
contributions.

So don't let the checks derail what you're actually trying to build:

- **You're not responsible for pre-existing debt outside your change.** If a
  duplication or coverage check trips on code you didn't touch — say, it wants
  you to de-duplicate something in an area unrelated to your feature — that is
  not a detour you need to take. Leave it.
- **Thresholds can be relaxed temporarily.** Several limits (duplication,
  coverage, and lint-suppression counts) are just numbers in config files
  (`config/.jscpd*.json`, the thresholds in `vitest.config.ts`, and the
  suppression-limit tests). If a strict threshold is blocking exploration or a
  legitimate feature, it's fine to bump it so you can keep moving — just call it
  out in your PR. Restoring it to the earlier level can happen as a follow-up,
  often in the main repo by the maintainer, so it doesn't have to be your
  problem.
- **When in doubt, ask.** Open a
  [discussion](https://github.com/adamjmurray/producer-pal/discussions) or a
  [Discord](https://discord.gg/rmU3DSzgwH) thread. It's better to check than to
  spend hours satisfying a check that was never the point of your change.

The goal is a clean codebase _and_ a low-friction contribution experience. If
those two ever seem to conflict on your PR, flag it — that's useful feedback.

## Extending Producer Pal

The core is focused on Ableton Live control via MCP — each tool directly wraps
Live API calls, optimized for doing the most with the fewest tools and tokens.
The **toolset has stabilized**: which tools exist and how they're split up won't
change often, and changing a tool's shape or adding a new tool takes some
convincing. Please open a discussion and ask before starting that kind of work —
large PRs that add new tool domains or require external dependencies won't be
accepted without prior agreement.

This is by design. A stable core means extensions don't break, and the
interesting innovation happens through extensions rather than a PR queue.

**There are better ways to add capabilities.** The
[Extending Producer Pal](https://producer-pal.org/extending) page covers the
current extension points — the REST API for scripting Live directly, Agent
Skills for working from coding agents, and custom skills / global context for
shaping LLM behavior without code — plus the ideas under consideration for
what's next.

**What IS welcome as a core PR:** Bug fixes, improvements to default skill text
and tool/argument descriptions, evaluations, documentation, and targeted
optimizations to reduce cost and improve efficiency across all model types. If
you find a tweak that makes the LLM behave better, that can go straight into
core.

**Especially welcome — bring your experiments:** The stable-core rule is about
the tool _surface_, not about ideas. Some areas are explicitly open to
exploration. A quick "here's what I'm thinking" discussion first helps us shape
it together:

- **Skills and chat system instructions.** I'm very open to proposed changes to
  the built-in Producer Pal Skills and the built-in Chat UI system instructions,
  especially when they come out of real experiments showing better LLM behavior.
- **Coding-agent skills.** Producer Pal ships a portable
  [Agent Skill](https://producer-pal.org/guide/skills) (the `SKILL.md`
  convention used by Claude Code, Codex CLI, Gemini CLI, and others) in
  `examples/skills/`. I'd love more examples covering different workflows and
  agents — and I'm happy to feature good ones on the website.
- **MIDI notation and transforms.** Experiments with alternative MIDI notation
  systems are welcome, and I'm open to additions to the
  [MIDI transforms](https://producer-pal.org/features/midi-notation#transforms)
  syntax. Worth asking about first so we can agree on the grammar direction.

**Back behavior changes with evals.** Changes to skills, tool descriptions, or
argument descriptions are most likely to be accepted when they come with
[evals](evals/README.md) demonstrating improved efficacy — ideally across both
large and small models where applicable, since a prompt tweak that helps a
frontier model can regress a small local one (and vice versa). "It behaves
better for me" is a good start; a scenario that _shows_ it is what lands the
change.

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
