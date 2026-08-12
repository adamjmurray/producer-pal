# Other MCP-compatible LLMs

Producer Pal works with any LLM that supports the Model Context Protocol (MCP).

Use `npx producer-pal` to connect to Producer Pal's MCP server. Its flags and
environment variables are listed in the
[`npx producer-pal` reference](/guide/npx-cli).

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- AI that supports [MCP](https://modelcontextprotocol.io)
- [Node.js 20+](https://nodejs.org/en/download) — only needed if connecting via
  `npx producer-pal` (Option A below); not required for Option B or C

## Installation Steps

<!--@include: ../_partials/install-device.md-->

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

Add the `--small-model-mode` flag to enable
[Small Model Mode](./lm-studio#_2-enable-small-model-mode-optional-but-recommended),
which simplifies the tool interface for smaller LLMs and automatically enables
it on the device when connected:

```json
{
  "command": "npx",
  "args": ["-y", "producer-pal", "--small-model-mode"]
}
```

:::

::: details Only need some of the tools?

Add `--tools` to keep just the tools you want, or `--disable-tools` to drop the
ones you don't:

```json
{
  "command": "npx",
  "args": ["-y", "producer-pal", "--tools", "core,clip,track"]
}
```

<!--@include: ../_partials/toolset-tip.md-->

:::

::: details Advanced: enabling the Direct Live API

Add the `--live-api` flag to turn on the opt-in
[Direct Live API](/features/tools#ppal-live-api) tool (`ppal-live-api`) when the
server connects — the same setting as the device's **Setup** tab, so it's global
to the device:

```json
{
  "command": "npx",
  "args": ["-y", "producer-pal", "--live-api"]
}
```

Not recommended as a default — the specialized tools are tuned for reliable
results, while the raw Live API is low-level and easy to misuse. Use it for
custom control, integrations, or debugging directly against the
[Live Object Model](https://docs.cycling74.com/apiref/lom/) when the standard
tools aren't enough. The flag only ever _enables_ the tool; it never turns off a
setting you toggled on the device.

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
    }
  }
}
```

Once Producer Pal is configured, start a new chat with Producer Pal tools
enabled, say "connect to ableton" or "connect to ableton with your producer pal
tools", and allow the tools to be used:

![Using Producer Pal with Cline](/img/cline-success.png)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
