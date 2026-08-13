# Antigravity

Google's agent app for Gemini models. Setup takes one extra step compared to the
other desktop apps, because custom MCP servers are added by editing a config
file instead of filling in a form.

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Node.js 20+](https://nodejs.org/en/download)
- [Antigravity](https://antigravity.google/) (requires a Google account)

Producer Pal doesn't need the IDE version — the standard app is enough. The IDE
works the same way if you'd rather use it (there's an "Install IDE" button in
the top right of the app).

## Installation Steps

<!--@include: ../_partials/install-device.md-->

### 2. Open the MCP Config

Go to Settings &rarr; Customizations and find **Installed MCP Servers**. The
Skills list above it is long, so collapse **Skills** or scroll past it. Click
**Open MCP Config**:

<img src="/img/antigravity-mcp-server-setup.png" alt="Antigravity's Customizations settings with the Open MCP Config button" width="650"/>

That opens `~/.gemini/config/mcp_config.json` in an editor. Antigravity has no
in-app editor for custom MCP servers, so this file is the only way to add one.

::: warning Not the same file as Gemini CLI

[Gemini CLI](./gemini-cli) reads `~/.gemini/settings.json`. Antigravity reads
`~/.gemini/config/mcp_config.json`. Same folder, separate configs — adding
Producer Pal to one does not add it to the other.

:::

### 3. Add Producer Pal

**Option A: With npx (recommended)** — Allows flexible startup order and
auto-reconnection:

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

::: tip Only need some of the tools?

Narrow the toolset and every conversation gets smaller:

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": ["-y", "producer-pal", "--tools", "core,clip,track"]
    }
  }
}
```

<!--@include: ../_partials/toolset-tip.md-->

:::

**Option B: Direct HTTP** — Requires Ableton running first, no
auto-reconnection:

```json
{
  "mcpServers": {
    "producer-pal": {
      "serverUrl": "http://localhost:3350/mcp"
    }
  }
}
```

Save the file, then click **Refresh** back in Customizations. Producer Pal
should appear under Installed MCP Servers with its tools enabled:

<img src="/img/antigravity-mcp-server-success.png" alt="Producer Pal listed as an installed MCP server in Antigravity" width="650"/>

### 4. Start Using Producer Pal

1. Start a conversation with "connect to ableton"
2. Allow Producer Pal tools to be used when Antigravity asks:

<img src="/img/antigravity-permissions.png" alt="Antigravity asking permission to use a Producer Pal tool" width="650"/>

<img src="/img/antigravity-success.png" alt="Antigravity successfully connected to Producer Pal" width="650"/>

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
