# Command Line Interfaces

For users comfortable with the terminal. Each guide below sets the CLI up as an
MCP client, usually via `npx producer-pal`.

Claude Code, Codex CLI, and Gemini CLI can use the portable
[Agent Skill](/guide/skills) instead — it drives the
[REST API](/guide/rest-api), so there's no MCP config at all.

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
for the exact steps and config for your CLI, and the
[`npx producer-pal` reference](/guide/npx-cli) for every flag and environment
variable it accepts.

## Or skip MCP

The [Agent Skill](/guide/skills) is one folder you unzip into
`~/.claude/skills/`, `~/.codex/skills/`, or `~/.gemini/skills/` — no per-CLI
config format to learn. The agent shells out to a small Node script that calls
the [REST API](/guide/rest-api), which lets it choose its own
[notation](/features/midi-notation) and toolset per request while your other
clients keep theirs.
