# Gemini CLI

Use Producer Pal with Google's command line coding assistant.

::: warning Free Tier Limitations

Gemini CLI works best with a
[Google AI Pro subscription](https://one.google.com/about/google-ai-plans/).
Without a subscription, the free tier has strict rate limits and you'll hit
quotas quickly. Consider [Claude Code](./claude-code) for an alternative CLI
experience.

:::

If you feel comfortable with the command line, this is an option for using
Producer Pal. Also consider using Gemini with Producer Pal's
[built-in chat UI](./gemini) (but probably via OpenRouter as noted on that
page).

## Requirements

- [Ableton Live 12.3+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)
- [Node.js 20+](https://nodejs.org/en/download)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli?#-installation)
  (requires Google account)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

![Producer Pal device running in Ableton Live](/device-main-tab.png)

_It should display "Producer Pal Running" or something isn't working._

### 2. Configure Gemini CLI

Add Producer Pal to Gemini's settings in `~/.gemini/settings.json`:

**Option A: With npx (recommended)** - Allows flexible startup order and
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

**Option B: Direct HTTP** - Requires Ableton running first, no
auto-reconnection:

```json
{
  "mcpServers": {
    "producer-pal": {
      "httpUrl": "http://localhost:3350/mcp"
    }
  }
}
```

**Option C: Download portal script** - Same benefits as npx:

Download
[producer-pal-portal.js](https://github.com/adamjmurray/producer-pal/releases/latest/download/producer-pal-portal.js)
and configure:

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "node",
      "args": ["/absolute/path/to/producer-pal-portal.js"]
    }
  }
}
```

### 3. Start Gemini CLI

Run `gemini` in an empty folder (so it can focus on Producer Pal instead of
coding)

### 4. Verify Tools

Run `/mcp list` in the Gemini CLI to confirm the Producer Pal tools are
available:

![Producer Pal tools listed in Gemini CLI](/gemini-tool-list.png)

### 5. Start Using Producer Pal

1. Start a conversation with "connect to ableton"
2. Allow Producer Pal tools to be used when Gemini tries to use them:

![Gemini CLI tool permission prompt](/gemini-tool-permissions.png)

![Gemini CLI successfully connected to Producer Pal](/gemini-success.png)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](./troubleshooting).
