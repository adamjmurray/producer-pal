# Codex CLI

Use Producer Pal with OpenAI's command line coding assistant.

::: tip Prefer a Desktop App?

The [Codex App](./codex-app) offers an easier setup with a graphical interface.
The CLI is best for developers who prefer the terminal.

:::

If you feel comfortable with the command line and have an OpenAI subscription,
this is a good option.

## Requirements

- [Ableton Live 12.3+](https://www.ableton.com/live/) with
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

<img src="/img/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

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

### 3. Start Codex

Run `codex` in an empty folder (so it can focus on Producer Pal instead of
coding)

### 4. Verify Tools

Run `/mcp` in the Codex CLI to confirm the Producer Pal tools are available:

![Producer Pal tools listed in Codex CLI](/img/codex-tool-list.png)

### 5. Start Using Producer Pal

Start a conversation with "connect to ableton"

![Codex CLI successfully connected to Producer Pal](/img/codex-success.png)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
