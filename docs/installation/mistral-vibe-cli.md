# Mistral Vibe CLI

Use Producer Pal with Mistral's open-source command line coding assistant.

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Node.js 20+](https://nodejs.org/en/download)
- [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe#readme), signed
  in with your Mistral account or an API key

## Installation Steps

<!--@include: ../_partials/setup-by-ai.md-->

### 1. Configure Mistral Vibe CLI

<!--@include: ../_partials/mcp-option-npx.md-->

```bash
vibe mcp add producer-pal --transport stdio --command npx --arg=-y --arg=producer-pal@latest
```

::: tip Shared with the Mistral Vibe app

The [Mistral Vibe](./mistral-vibe) desktop app reads the same configuration, so
this sets up both.

:::

<!--@include: ../_partials/mcp-option-http.md-->

Add this to your Vibe configuration file (`~/.vibe/config.toml`). Edit the file
for this option: `vibe mcp add` with a URL expects a server that needs a login.

```toml
[[mcp_servers]]
name = "producer-pal"
transport = "streamable-http"
url = "http://localhost:3350/mcp"
```

### 2. Start Using Producer Pal

1. Run `vibe` in an empty folder (so it can focus on Producer Pal instead of
   coding)
2. With Live open, start a conversation with "connect to ableton"
3. Allow Producer Pal tools to be used when prompted

<!--@include: ../_partials/setup-by-ai-finish.md-->

<!--@include: ../_partials/check-it-works.md-->

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
