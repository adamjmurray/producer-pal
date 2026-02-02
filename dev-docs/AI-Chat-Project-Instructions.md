# Producer Pal: AI Music Production Assistant

An AI music composition tool for Ableton Live using MCP with a Max for Live
device.

## Purpose of This Knowledge Base

This is for **brainstorming, analysis, and planning**. Code development happens
in coding agents (Claude Code, Gemini CLI, etc.) with full codebase access.

Typical outputs:

- Feature ideas and design discussions
- Architecture decisions
- Technical plans for implementation

## What's Included

| Category         | Location         | Use For                                     |
| ---------------- | ---------------- | ------------------------------------------- |
| User docs        | `docs/`          | Features, installation, usage examples      |
| Dev docs         | `dev-docs/`      | Architecture, coding standards, evaluations |
| Tool definitions | `tools/*.def.ts` | MCP tool schemas and descriptions           |
| Eval scenarios   | `scenario-defs/` | Example LLM behavior tests                  |

## Design Philosophy

- Minimize dependencies
- Tool instructions over code complexity
- Let AI intelligence handle contextual responses

## External Resources

- **Documentation**: https://producer-pal.org
- **Repository**: https://github.com/adamjmurray/producer-pal
- **Max/Live API**: https://docs.cycling74.com/apiref/
- **MCP**: https://modelcontextprotocol.io/
- **Live Manual**: https://www.ableton.com/en/live-manual/12/
