# Mistral Vibe

Mistral's desktop app (formerly Le Chat). Custom MCP servers are added by
editing a config file instead of filling in a form.

::: warning Code tab only

Producer Pal works in the **Code** tab, not the **Work** tab. The Work tab can
only reach servers on the public internet, which needs a
[web tunnel](./mistral-le-chat) and is not recommended.

:::

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Node.js 20+](https://nodejs.org/en/download)
- [Mistral Vibe](https://mistral.ai/products/vibe/) for macOS or Windows
  (requires a Mistral account)

## Installation Steps

<!--@include: ../_partials/setup-by-ai.md-->

### 1. Add Producer Pal

Open `config.toml` in the `.vibe` folder of your home folder
(`~/.vibe/config.toml`) in a text editor, creating the file if it doesn't exist,
and add Producer Pal:

<!--@include: ../_partials/mcp-option-npx.md-->

```toml
[[mcp_servers]]
name = "producer-pal"
transport = "stdio"
command = "npx"
args = ["-y", "producer-pal@latest"]
```

<!--@include: ../_partials/mcp-option-http.md-->

```toml
[[mcp_servers]]
name = "producer-pal"
transport = "streamable-http"
url = "http://localhost:3350/mcp"
```

Save the file and restart Mistral Vibe.

::: tip Shared with Mistral Vibe CLI

[Mistral Vibe CLI](./mistral-vibe-cli) reads the same file, and can add Producer
Pal to it with one command.

:::

### 2. Start Using Producer Pal

1. Open the **Code** tab and start a new conversation
2. With Live open, say "connect to ableton"
3. Allow Producer Pal tools to be used when prompted

<!--@include: ../_partials/setup-by-ai-finish.md-->

<!--@include: ../_partials/check-it-works.md-->

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
