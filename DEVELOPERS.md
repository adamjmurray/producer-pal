# Producer Pal Development Info

Contributing to Producer Pal

I maintain the core MCP tools and feature roadmap myself to keep development
moving quickly. But there's plenty of room to collaborate:

**High-value contributions:**

- End-to-end testing automation and LLM evaluations
- Small language model optimization (making Ollama/LM Studio work better)
- Voice interaction development
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

## Building from source

Requires [Node.js](https://nodejs.org) (recommended v22 or higher)

1. Clone this repository
2. `npm install`
3. `npm run build` (for production) or `npm run build:all` (for development with
   debugging tools)
4. Add the `max-for-live-device/Producer_Pal.amxd` Max for Live device to a MIDI
   track in Ableton Live
5. Drag and drop `claude-desktop-extension/Producer_Pal.mcpb` to Claude Desktop
   → Settings → Extension

**Note**: For development and testing, use `npm run build:all` to include
debugging tools like `ppal-raw-live-api`.

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
npm run check  # Runs all checks: lint + typecheck + format check + tests
```

**Recommended workflow**: Run `npm run fix` before `npm run check` to
automatically fix issues and save time.

Or run checks individually:

```
npm run lint
npm run typecheck  # UI code only
npm test
npm run format:check
```

## Web UI Development

The chat interface is a Preact web application built with Vite. It's served from
the MCP server at `http://localhost:3350/chat` and opened in your system's
default browser. It connects to both the Gemini API and the local MCP server.

### Development Server

```bash
npm run ui:dev
```

This starts a dev server at http://localhost:5173 with hot reload. Changes to
webui source files will update automatically in the browser. Occasionally a page
refresh may be needed if things stop working.

**Note:** The dev server runs on a different port (5173) than the production
server (3350). Both connect to the MCP server at http://localhost:3350/mcp. For
full integration testing, use the production build served from port 3350.

### Production Build

```bash
npm run ui:build
```

Builds a single self-contained `max-for-live-device/chat-ui.html` file. This is
automatically included in `npm run build`.

### Linting

```bash
npm run lint
```

Runs ESLint on the UI code (`webui/src/**`). Enforces code quality rules
including strict TypeScript typing (no `any` types) and React best practices
(like avoiding JSX in try/catch blocks). All code changes should pass linting
before committing.

Use `npm run lint:fix` to automatically fix issues where possible.

### Type Checking

```bash
npm run typecheck
```

Runs TypeScript type checking on the UI code (JavaScript files with JSDoc
annotations). Currently only checks production code, not tests. All UI changes
should pass type checking before committing.

### Development Workflows

**Working on MCP server/tools only** (UI doesn't need changes):

- Build UI once: `npm run build` (or just `npm run ui:build`)
- Run: `npm run dev` (watches MCP server, V8, Portal)
- Access UI at http://localhost:3350/chat

**Working on web UI only** (MCP server doesn't need changes):

- Build MCP server once: `npm run build`
- Run: `npm run ui:dev` (watches UI with hot reload)
- Access UI at http://localhost:5173

**Working on everything** (full-stack development):

- Terminal 1: `npm run dev` (watches MCP server, V8, Portal)
- Terminal 2: `npm run ui:dev` (watches UI with hot reload)
- Access UI at http://localhost:5173

**Tip:** The Max for Live device has a button to open http://localhost:3350/chat
in your browser.

### Architecture

See `dev-docs/Chat-UI.md` for detailed information about:

## Documentation Site

The project documentation is built with VitePress and deployed to
https://producer-pal.org. The source files are in the `docs/` directory.

Development commands:

```bash
npm run docs:dev     # Development server with hot reload
npm run docs:build   # Build static site
npm run docs:preview # Preview production build
```

The site automatically deploys to https://producer-pal.org when changes are
pushed to the main branch.

**Clean URLs**: The site uses VitePress clean URLs (`cleanUrls: true`). When
linking to pages within the docs, use clean URL format without trailing slashes
(e.g., `/installation/chat-ui` instead of `/installation/chat-ui.html`). Page
files are named after their folder (e.g., `docs/installation.md` instead of
`docs/installation/index.md`), except for the top-level `docs/index.md`.

See `dev-docs/Documentation-Site.md` for deployment details, configuration, and
content guidelines.

## Testing and Debugging

To test/debug, you can use:

```
DANGEROUSLY_OMIT_AUTH=true npx @modelcontextprotocol/inspector
```

and then open
http://localhost:6274/?transport=streamable-http&serverUrl=http://localhost:3350/mcp

Note: you can omit `DANGEROUSLY_OMIT_AUTH=true` but then you need to connect via
proxy in the MCP inspector's settings, and the proxy session token needs to be
set per the command line's output (it's randomly generated). Running
`npx @modelcontextprotocol/inspector` will open a popup window with that so
already configured, so you can use that window and then manually configure the
streamable HTTP transport and URL.

## Manual Testing Notes

**Important**: After changing tool descriptions in the Producer Pal code (like
in `src/tools/**/*.def.js`), you must toggle the Producer Pal extension off/on
in Claude Desktop to refresh the cached tool definitions. Simply rebuilding the
code or restarting Claude Desktop is not sufficient - the extension must be
disabled and re-enabled in Claude Desktop → Settings → Extensions to see updated
tool descriptions.

## Coding Agents and AI Assistance

Coding agents assist with development of this project. The primary agent is
Claude Code, with Gemini CLI and OpenAI Codex CLI as supported alternatives. An
`AGENTS.md` file provides coding standards, with `CLAUDE.md` and `GEMINI.md`
triggering their respective agents to use it. The `doc` folder contains
reference documentation for development tasks.

Additionally, there is a feature `npm run knowledge-base` (or the shortcut
`npm run kb`) which flattens the project contents into a `knowledge-base`
folder. This can be imported into AI chat projects (Claude Projects, ChatGPT
Projects, Gemini Projects, etc.) for complex brainstorming and planning
sessions. Results can then be fed back into coding agents (for example by
generating new files for the `doc` folder). There's a few variations of this
command:

- `npm run kb` generates the full knowledge base with one file per original file
  (nearly everything in the repo except stuff like gitignored files, generated
  files, dependencies)
- `npm run kb:small` generates the knowledge base without any tests because
  tests take up the majority of space and typically don't need to be analyzed
  unless you're specifically improving the test suite
- `npm run kb:chatgpt` concatenates groups of files together (like every folder
  under src) to stay under the 20 file limit for ChatGPT projects (NOTE: it's
  unclear how well this works in practice - results seem less impressive than
  Claude Project with the kb or kb:small knowledge base)

When using a chat project, copy `dev-docs/AI-Chat-Project-Instructions.md` into
the project instructions for the AI chat app of choice. This file provides
useful information similar to `AGENTS.md` but adapted for standalone chat apps.

## Development Testing

For development testing, there are two main approaches:

### Direct MCP Connection (Preferred)

Add the MCP server directly to Claude Code for the best development experience:

```sh
claude mcp add --transport http producer-pal http://localhost:3350/mcp
```

**Requirements:**

- Producer Pal Max for Live device must be running in Ableton Live before
  starting a Claude Code session
- Run `npm run dev` for auto-rebuild on changes
- Provides direct access to all producer-pal tools through Claude Code

This approach is preferred for development testing as it provides seamless
integration with Claude Code's MCP capabilities.

### CLI Tool (Fallback)

For situations where the direct MCP connection isn't available or working, use
the CLI tool at `scripts/cli.mjs` to directly connect to the MCP server:

```sh
# Show server info (default)
node scripts/cli.mjs

# List available tools
node scripts/cli.mjs tools/list

# Call a tool with JSON arguments
node scripts/cli.mjs tools/call ppal-read-live-set '{}'
node scripts/cli.mjs tools/call ppal-duplicate '{"type": "scene", "id": "7", "destination": "arrangement", "arrangementStart": "5|1"}'

# Use a different server URL
node scripts/cli.mjs http://localhost:6274/mcp tools/list

# Show help
node scripts/cli.mjs --help
```

This CLI tool connects directly to your running Ableton Live session and can
help debug real-world issues by exercising the full MCP stack with actual Live
data.

## Development Tools

### Raw Live API Access

For development and debugging, a `ppal-raw-live-api` tool is available when
building with `npm run dev` or `npm run build:all` (but NOT with the regular
`npm run build`). This tool provides direct access to the Live API for research
and advanced debugging:

```sh
# Example: Get tempo using multiple operation types
node scripts/cli.mjs tools/call ppal-raw-live-api '{
  "path": "live_set",
  "operations": [
    {"type": "get", "property": "tempo"},
    {"type": "getProperty", "property": "tempo"}
  ]
}'

# Example: Navigate to a track and check if it exists
node scripts/cli.mjs tools/call ppal-raw-live-api '{
  "operations": [
    {"type": "goto", "value": "live_set tracks 0"},
    {"type": "exists"},
    {"type": "getProperty", "property": "name"}
  ]
}'
```

The `ppal-raw-live-api` tool supports 13 operation types including core
operations (`get_property`, `set_property`, `call_method`), convenience
shortcuts (`get`, `set`, `call`, `goto`, `info`), and extension methods
(`getProperty`, `getChildIds`, `exists`, `getColor`, `setColor`).

## Releasing

See [dev-docs/Releasing.md](dev-docs/Releasing.md) for the complete release
process, including version bumping, building, creating GitHub releases, testing
checklists, and publishing to npm.
