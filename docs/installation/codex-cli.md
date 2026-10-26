# Codex CLI

Use Producer Pal with OpenAI's command line coding assistant.

::: tip Prefer a Desktop App?

The [ChatGPT App](./chatgpt-app), which now includes Codex, offers an easier
setup with a graphical interface. The CLI is best for developers who prefer the
terminal. Both share the same MCP configuration (`~/.codex/config.toml`), so
setting up Producer Pal in one makes it available in the other.

:::

If you feel comfortable with the command line and have an OpenAI subscription,
this is a good option.

<!--@include: ../_partials/agent-skill-callout.md-->

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Node.js 22+](https://nodejs.org/en/download) (required by Codex; Producer Pal
  itself only needs 20+)
- [OpenAI Codex](https://github.com/openai/codex#quickstart) (requires OpenAI
  account, and a paid subscription at time of writing)

## Installation Steps

<!--@include: ../_partials/setup-by-ai.md-->

### 1. Configure Codex

Add Producer Pal to Codex's settings in `~/.codex/config.toml`:

<!--@include: ../_partials/mcp-option-npx.md-->

```toml
[mcp_servers.producer-pal]
command = "npx"
args = ["-y", "producer-pal@latest"]
```

::: tip Scripting or building against Producer Pal?

<!--@include: ../_partials/scripting-tip-intro.md-->

```toml
[mcp_servers.producer-pal]
command = "npx"
args = [
  "-y",
  "producer-pal@latest",
  "--format",
  "json",
  "--notation",
  "midi-json",
]
```

<!--@include: ../_partials/scripting-tip.md-->

:::

::: tip Only need some of the tools?

Narrow the toolset and every conversation gets smaller:

```toml
[mcp_servers.producer-pal]
command = "npx"
args = ["-y", "producer-pal@latest", "--tools", "core,clip,track"]
```

<!--@include: ../_partials/toolset-tip.md-->

:::

<!--@include: ../_partials/mcp-option-http.md-->

```toml
[mcp_servers.producer-pal]
url = "http://localhost:3350/mcp"
```

### 2. Start Codex

Run `codex` in an empty folder (so it can focus on Producer Pal instead of
coding)

### 3. Verify Tools

Run `/mcp` in the Codex CLI to confirm the Producer Pal tools are available:

![Producer Pal tools listed in Codex CLI](/img/codex-tool-list.png)

### 4. Start Using Producer Pal

With Live open, start a conversation with "connect to ableton".

<!--@include: ../_partials/setup-by-ai-finish.md-->

![Codex CLI successfully connected to Producer Pal](/img/codex-success.png)

<!--@include: ../_partials/check-it-works.md-->

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
