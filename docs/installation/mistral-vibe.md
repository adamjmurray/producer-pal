# Mistral Vibe

Use Producer Pal with Mistral's open-source command line coding assistant.

## Requirements

- [Ableton Live 12.3+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)
- [Node.js 20+](https://nodejs.org/en/download)
- [Mistral Vibe](https://github.com/mistralai/mistral-vibe) (requires Mistral
  API key)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

<img src="/img/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

_It should display "Producer Pal Running" or something isn't working._

### 2. Configure Mistral Vibe

Add Producer Pal to your Vibe configuration file (`~/.vibe/config.toml`):

**Option A: With npx (recommended)** — Allows flexible startup order and
auto-reconnection:

```toml
[[mcp_servers]]
name = "producer-pal"
transport = "stdio"
command = "npx"
args = ["-y", "producer-pal"]
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
