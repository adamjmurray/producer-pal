# Command Line Interfaces

For users comfortable with the terminal. All CLI options require `npx producer-pal` or equivalent MCP configuration.

| CLI | Provider | Cost | Notes |
|-----|----------|------|-------|
| [Gemini CLI](./gemini-cli) | Google | Free tier (strict limits) | Best free option |
| [Codex CLI](./codex-cli) | OpenAI | Subscription | GPT models |
| [Claude Code](./claude-code) | Anthropic | Subscription | Claude models |

## Quick Start

All CLI tools use similar MCP configuration:

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": ["-y", "producer-pal"]
    }
  }
}
```

See individual guides for specific setup steps.
