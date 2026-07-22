# Command Line Interfaces

For users comfortable with the terminal. All CLI options require
`npx producer-pal` or equivalent MCP configuration.

| CLI                            | Provider  | Cost                      | Notes            |
| ------------------------------ | --------- | ------------------------- | ---------------- |
| [Gemini CLI](./gemini-cli)     | Google    | Free tier (strict limits) | Best free option |
| [Codex CLI](./codex-cli)       | OpenAI    | Subscription              | GPT models       |
| [Claude Code](./claude-code)   | Anthropic | Subscription              | Claude models    |
| [Mistral Vibe](./mistral-vibe) | Mistral   | API key                   | Mistral models   |

## Quick Start

Every CLI runs the same `npx producer-pal` command under the hood, but each tool
has its own MCP configuration format — a `claude mcp add` command, a TOML file,
or a JSON file, depending on the tool. See the individual guides linked above
for the exact steps and config for your CLI.
