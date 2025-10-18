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

- **Language**: JavaScript only (embedded environment constraint)
- **Platform**: Live 12.2, Max 9, Node.js 20
- **Repository**: https://github.com/adamjmurray/producer-pal
- **Documentation**: See AGENTS.md in project resources for coding standards

## Critical Rules

- **Testing**: Always use `npm run build:all` for development (includes debug
  tools)
- **Manual Testing**: After changing tool descriptions, toggle extension off/on
  in Claude Desktop (and in the future, other .mcpb compatible desktop apps)
- **Files**: All source files must have `// path/to/file.js` as first line
  comment
- **Missing Files**: Don't infer contents - ask if files are missing
- **Duplicate Files**: Report any duplicates immediately

## Architecture Overview

- **MCP Server** (`src/mcp-server/mcp-server.js`): Runs in Node for Max
- **V8 Code** (`src/live-api-adapter/live-api-adapter.js`): Runs in Max v8
  object, calls Live API
- **Producer Pal Portal** (`src/portal/producer-pal-portal.js`): Adapts the MCP
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
  - Tool/parameter descriptions in `.def.js` files
  - Producer Pal Skills content
  - Tool result messages
  - Focus on most useful/relevant info only

## Reference Documentation

In project resources:

- `AGENTS.md` - Coding standards for coding agents (Claude Code, Gemini CLI,
  OpenAI Codex CLI)
- `CLAUDE.md` - Trigger Claude Code to use AGENTS.md
- `GEMINI.md` - Trigger Gemini CLI to use AGENTS.md
- `doc/Architecture.md` - System design details
- `doc/Coding-Standards.md` - Code patterns and rules
- `doc/Development-Tools.md` - CLI and debugging tools
- `DEVELOPERS.md` - Development setup
- `FEATURES.md` - Feature list
- `INSTALLATION.md` - Installation guide supporting various LLMs
- `LICENSE` - The software license (MIT)

## Trusted Resources

If web search needed:

- Max/Live API: https://docs.cycling74.com/apiref/
- MCP: https://modelcontextprotocol.io/
- Live Manual: https://www.ableton.com/en/live-manual/12/
- Tutorials: https://adammurray.link/max-for-live/
