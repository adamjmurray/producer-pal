# Other MCP-compatible LLMs

Producer Pal works with any LLM that supports the Model Context Protocol (MCP).

Use `npx producer-pal` to connect to Producer Pal's MCP server.

## Requirements

- [Ableton Live 12.3+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)
- AI that supports [MCP](https://modelcontextprotocol.io)
- Potentially: [Node.js 20+](https://nodejs.org/en/download)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

<img src="/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

_It should display "Producer Pal Running" or something isn't working._

### 2. Configure Your AI

Configure your AI to connect to Producer Pal using one of the following methods:

## Connection Methods

### Option A: Local MCP via stdio with npx (Recommended)

Allows flexible startup order and auto-reconnection. Configure your LLM MCP to
use:

```bash
npx -y producer-pal
```

This option requires [Node.js 20+](https://nodejs.org/en/download).

::: details Using a small/local model?

If you're using a small local model with
[Small Model Mode](./lm-studio#_2-enable-small-model-mode-optional-but-recommended)
enabled in the device, enable the `SMALL_MODEL_MODE` environment variable in
your MCP server settings:

```json
{
  "command": "npx",
  "args": ["-y", "producer-pal"],
  "env": {
    "SMALL_MODEL_MODE": "true"
  }
}
```

This ensures the AI won't cache large model tool definitions if a conversation
is started before Ableton Live and the Producer Pal device are running.

:::

### Option B: Local MCP via HTTP

Requires Ableton running first, no auto-reconnection. Use the URL:

```
http://localhost:3350/mcp
```

Sometimes an additional setting is needed for HTTP connections. For example,
[Cline](https://cline.bot/) requires `"type": "streamableHttp"` to be configured
along with the `url` (see example below).

You may need to restart your AI app or refresh MCP servers if you forgot to run
Ableton Live with Producer Pal Max first.

### Option C: Remote MCP via HTTP tunnel

Requires Ableton running first, no auto-reconnection. For cloud-hosted LLMs or
remote access:

1. Set up a [web tunnel](./web-tunnels) (e.g. Cloudflare or Pinggy)
2. Configure your LLM with the public URL + `/mcp`

### Option D: Download portal script (standalone npm package)

Same benefits as npx:

Download
[producer-pal-portal.js](https://github.com/adamjmurray/producer-pal/releases/latest/download/producer-pal-portal.js)
and configure your LLM MCP to use:

```bash
node /path/to/producer-pal-portal.js
```

This option requires [Node.js 20+](https://nodejs.org/en/download).

::: details Using a small/local model?

If you're using a small local model with
[Small Model Mode](./lm-studio#_2-enable-small-model-mode-optional-but-recommended)
enabled in the device, enable the `SMALL_MODEL_MODE` environment variable in
your MCP server settings:

```json
{
  "command": "node",
  "args": ["/path/to/producer-pal-portal.js"],
  "env": {
    "SMALL_MODEL_MODE": "true"
  }
}
```

This ensures the AI won't cache large model tool definitions if a conversation
is started before Ableton Live and the Producer Pal device are running.

:::

## Example: Configuring Cline

[Cline](https://cline.bot/) is an IDE plugin for AI that can be configured to
use Producer Pal in its `cline_mcp_settings.json` config file:

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": ["-y", "producer-pal"]
    },
    // OR use HTTP:
    "producer-pal-http": {
      "type": "streamableHttp",
      "url": "http://localhost:3350/mcp"
    },
    // OR download the portal script and use:
    "producer-pal-download": {
      "command": "node",
      "args": ["/absolute/path/to/producer-pal-portal.js"]
    }
  }
}
```

Once Producer Pal is configured, start a new chat with Producer Pal tools
enabled, say "connect to ableton" or "connect to ableton with your producer pal
tools", and allow the tools to be used:

![Using Producer Pal with Cline](/cline-success.png)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](./troubleshooting).
