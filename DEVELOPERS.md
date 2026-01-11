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

## Web UI Development

The chat interface is a Preact web application built with Vite.

Quick commands:

- `npm run ui:dev` - Dev server at localhost:5173 with hot reload
- `npm run ui:build` - Production build to `max-for-live-device/chat-ui.html`

See [dev-docs/Chat-UI.md](dev-docs/Chat-UI.md) for architecture, component
structure, and detailed development workflows.

## Documentation Site

The project documentation is built with VitePress and deployed to
https://producer-pal.org.

Quick commands:

- `npm run docs:dev` - Development server with hot reload
- `npm run docs:build` - Build static site
- `npm run docs:preview` - Preview production build

**Clean URLs**: Use `/installation/chat-ui` not `/installation/chat-ui.html`.

See [dev-docs/Documentation-Site.md](dev-docs/Documentation-Site.md) for
deployment, configuration, and content guidelines.

## Testing and Debugging

Quick commands:

- `node scripts/cli.mjs tools/list` - List available tools
- `node scripts/cli.mjs tools/call ppal-read-live-set '{}'` - Call a tool
- `npx @modelcontextprotocol/inspector` - MCP protocol debugging

**Important**: After changing tool descriptions in `src/tools/**/*.def.js`, you
must toggle the Producer Pal extension off/on in Claude Desktop to refresh the
cached tool definitions.

See [dev-docs/Development-Tools.md](dev-docs/Development-Tools.md) for the CLI
tool, Raw Live API tool, MCP Inspector setup, debugging tips, and testing
workflows.

## Releasing

See [dev-docs/Releasing.md](dev-docs/Releasing.md) for the complete release
process, including version bumping, building, creating GitHub releases, testing
checklists, and publishing to npm.

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

## Development Testing with Claude Code

For the best development experience, add the MCP server directly to Claude Code:

```sh
claude mcp add --transport http producer-pal http://localhost:3350/mcp
```

**Requirements:**

- Producer Pal Max for Live device must be running in Ableton Live before
  starting a Claude Code session
- Run `npm run dev` for auto-rebuild on changes

This provides direct access to all producer-pal tools through Claude Code.
