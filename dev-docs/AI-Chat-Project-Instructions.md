# Producer Pal: AI Music Production Assistant

An AI music production assistant for Ableton Live using the Model Context
Protocol (MCP) with a Max for Live device.

## Purpose of This Project

This AI chat project is for brainstorming, analysis, and planning. Code
development happens in coding agents (primarily Claude Code, sometimes Gemini
CLI or OpenAI Codex CLI). Outputs here are typically:

- Technical plans in markdown for the coding agent
- Code snippets to explore ideas
- Architecture decisions and design discussions

## Key Constraints

- **Language**: TypeScript in `src/`, `scripts/`, and `webui/`
- **Platform**: Live 12.3, Max 9, Node.js 20
- **Repository**: https://github.com/adamjmurray/producer-pal
- **Documentation**: See AGENTS.md in project resources for coding standards

## Critical Rules

- **Testing**: Always use `npm run build:all` for development (includes debug
  tools)
- **Manual Testing**: After changing tool descriptions, toggle extension off/on
  in Claude Desktop (and in the future, other .mcpb compatible desktop apps)
- **Missing Files**: Don't infer contents - ask if files are missing
- **Duplicate Files**: Report any duplicates immediately

## Architecture Overview

- **MCP Server** (`src/mcp-server/mcp-server.ts`): Runs in Node for Max
- **V8 Code** (`src/live-api-adapter/live-api-adapter.ts`): Runs in Max v8
  object, calls Live API
- **Producer Pal Portal** (`src/portal/producer-pal-portal.ts`): Adapts the MCP
  the stdio transport to the streaming http transport
- **Desktop Extension**: Bridges Claude Desktop to MCP server via the portal
- **Three Bundles**: MCP server bundle (Node.js), V8 bundle (Max), and MCP
  stdio-to-http "portal"

## Design Philosophy

- Minimize dependencies
- Tool instructions over code complexity
- Let AI intelligence handle contextual responses
- Return optimistic results for playback operations

## Producer Pal Skills & Context Management

- **Producer Pal Skills**: Returned by ppal-connect tool. Must be updated when:
  - Bar|beat notation changes
  - Tool behavior changes that invalidate its instructions
- **Context Window**: Keep all MCP-facing text minimal:
  - Tool/parameter descriptions in `.def.ts` files
  - Producer Pal Skills content
  - Tool result messages
  - Focus on most useful/relevant info only

## Reference Documentation

In project resources:

- `AGENTS.md` - Coding standards for coding agents (Claude Code, Gemini CLI,
  OpenAI Codex CLI)
- `CLAUDE.md` - Trigger Claude Code to use AGENTS.md
- `GEMINI.md` - Trigger Gemini CLI to use AGENTS.md
- `dev-docs/Architecture.md` - System design details
- `dev-docs/Coding-Standards.md` - Code patterns and rules
- `dev-docs/Development-Tools.md` - CLI and debugging tools
- `DEVELOPERS.md` - Development setup
- `docs/features/index.md` - Feature list (hosted at
  https://producer-pal.org/features/)
- `docs/installation/**` - Installation guide supporting various LLMs (hosted at
  https://producer-pal.org/installation/)
- `LICENSE` - The software license (MIT)

## Generating the Knowledge Base

Use `npm run knowledge-base` (or `npm run kb`) to flatten the project contents
into a `knowledge-base` folder for import into AI chat projects. The knowledge
base includes documentation, tool definitions, and eval scenarios - optimized
for high-level planning and brainstorming with LLMs.

Copy this file (`dev-docs/AI-Chat-Project-Instructions.md`) into the project
instructions for your AI chat app of choice.

## Trusted Resources

If web search needed:

- **Producer Pal Documentation**: https://producer-pal.org - User guides,
  installation instructions, features, and usage examples. Built with VitePress,
  source in `docs/` directory.
- Max/Live API: https://docs.cycling74.com/apiref/
- MCP: https://modelcontextprotocol.io/
- Live Manual: https://www.ableton.com/en/live-manual/12/
- Tutorials: https://adammurray.link/max-for-live/
