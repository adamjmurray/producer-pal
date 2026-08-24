# Mistral Vibe

Use Producer Pal with Mistral's open-source command line coding assistant.

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Node.js 20+](https://nodejs.org/en/download)
- [Mistral Vibe](https://github.com/mistralai/mistral-vibe) (requires Mistral
  API key)

## Installation Steps

<!--@include: ../_partials/install-device.md-->

### 2. Configure Mistral Vibe

Add Producer Pal to your Vibe configuration file (`~/.vibe/config.toml`):

**Option A: With npx (recommended)** — Allows flexible startup order and
auto-reconnection:

```toml
[[mcp_servers]]
name = "producer-pal"
transport = "stdio"
command = "npx"
args = ["-y", "producer-pal@latest"]
```

**Option B: Direct HTTP** — Requires Ableton running first, no
auto-reconnection:

```toml
[[mcp_servers]]
name = "producer-pal"
transport = "streamable-http"
url = "http://localhost:3350/mcp"
```

### 3. Start Using Producer Pal

1. Run `vibe` in an empty folder (so it can focus on Producer Pal instead of
   coding)
2. Start a conversation with "connect to ableton"
3. Allow Producer Pal tools to be used when prompted

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
