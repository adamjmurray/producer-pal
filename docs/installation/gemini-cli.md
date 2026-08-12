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

<!--@include: ../_partials/agent-skill-callout.md-->

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Node.js 20+](https://nodejs.org/en/download)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli?#-installation)
  (requires Google account)

## Installation Steps

<!--@include: ../_partials/install-device.md-->

### 2. Configure Gemini CLI

Add Producer Pal to Gemini's settings in `~/.gemini/settings.json`:

**Option A: With npx** (recommended for MCP) - Allows flexible startup order and
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

::: tip Scripting or building against Producer Pal?

If you're using MCP and will have the agent **write code that generates or
parses** Producer Pal data — building MIDI programmatically, or piping tool
output through JSON tooling — add `--format json` and `--notation midi-json` to
the args:

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": [
        "-y",
        "producer-pal",
        "--format",
        "json",
        "--notation",
        "midi-json"
      ]
    }
  }
}
```

<!--@include: ../_partials/scripting-tip.md-->

:::

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

### 3. Start Gemini CLI

Run `gemini` in an empty folder (so it can focus on Producer Pal instead of
coding)

### 4. Verify Tools

Run `/mcp list` in the Gemini CLI to confirm the Producer Pal tools are
available:

![Producer Pal tools listed in Gemini CLI](/img/gemini-tool-list.png)

### 5. Start Using Producer Pal

1. Start a conversation with "connect to ableton"
2. Allow Producer Pal tools to be used when Gemini tries to use them:

![Gemini CLI tool permission prompt](/img/gemini-tool-permissions.png)

![Gemini CLI successfully connected to Producer Pal](/img/gemini-success.png)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
