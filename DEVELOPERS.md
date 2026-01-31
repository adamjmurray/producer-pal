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

Requires [Node.js](https://nodejs.org) (recommended v24 or higher)

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

See [Chat-UI](dev-docs/Chat-UI.md) for architecture, component structure, and
detailed development workflows.

## Documentation Site

The project documentation is built with VitePress and deployed to
https://producer-pal.org.

Quick commands:

- `npm run docs:dev` - Development server with hot reload
- `npm run docs:build` - Build static site
- `npm run docs:preview` - Preview production build

**Clean URLs**: Use `/installation/chat-ui` not `/installation/chat-ui.html`.

See [Documentation-Site](dev-docs/Documentation-Site.md) for deployment,
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

See [Development-Tools](dev-docs/Development-Tools.md) for the CLI tool, Raw
Live API tool, MCP Inspector setup, debugging tips, and testing workflows.

## Releasing

See [Releasing](dev-docs/Releasing.md) for the complete release process,
including version bumping, building, creating GitHub releases, testing
checklists, and publishing to npm.
