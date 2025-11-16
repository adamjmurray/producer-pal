# Codex CLI

Use Producer Pal with OpenAI's command line coding assistant.

If you feel comfortable with the command line and have an OpenAI subscription,
this is a good option. It's the recommended way to use OpenAI models with
Producer Pal because using an OpenAI key with the [built-in chat UI](./chat-ui)
requires pay-as-you-go pricing for OpenAI's API.

## Requirements

- [Ableton Live 12.2+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)
- [Node.js 22+](https://nodejs.org/en/download)
- [OpenAI Codex](https://github.com/openai/codex#quickstart) (requires OpenAI
  account, and a paid subscription at time of writing)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

![Producer Pal device running in Ableton Live](/device-main-tab.png)

_It should display "Producer Pal Running" or something isn't working._

### 2. Configure Codex

Add Producer Pal to Codex's settings in `~/.codex/config.toml`:

**Option A: With npx (recommended)** - Allows flexible startup order and
auto-reconnection:

```toml
[mcp_servers.producer-pal]
command = "npx"
args = ["-y", "producer-pal"]
```

**Option B: Direct HTTP** - Requires Ableton running first, no
auto-reconnection:

```toml
[mcp_servers.producer-pal]
url = "http://localhost:3350/mcp"
```

**Option C: Download portal script** - Same benefits as npx:

Download
[producer-pal-portal.js](https://github.com/adamjmurray/producer-pal/releases/latest/download/producer-pal-portal.js)
and configure:

```toml
[mcp_servers.producer-pal]
command = "node"
args = ["/absolute/path/to/producer-pal-portal.js"]
```

### 3. Start Codex

Run `codex` in an empty folder (so it can focus on Producer Pal instead of
coding)

### 4. Verify Tools

Run `/mcp` in the Codex CLI to confirm the Producer Pal tools are available:

![Producer Pal tools listed in Codex CLI](/codex-tool-list.png)

### 5. Start Using Producer Pal

Start a conversation with "connect to ableton"

![Codex CLI successfully connected to Producer Pal](/codex-success.png)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](./troubleshooting).
