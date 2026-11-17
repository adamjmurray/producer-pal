# Antigravity CLI

Use Producer Pal with Google's command line coding assistant.

::: warning Best with a subscription

Antigravity CLI works best with a
[Google AI Pro subscription](https://one.google.com/about/google-ai-plans/).
Without one, you'll hit Google's usage limits quickly. Consider
[Claude Code](./claude-code) for an alternative CLI experience.

:::

If you feel comfortable with the command line, this is an option for using
Producer Pal. Also consider [Google Antigravity](./antigravity), Google's
desktop agent app, or using Gemini with Producer Pal's
[built-in chat UI](./api-keys#gemini) (but probably via OpenRouter as noted on
that page).

<!--@include: ../_partials/agent-skill-callout.md-->

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Node.js 20+](https://nodejs.org/en/download)
- [Antigravity CLI](https://antigravity.google/download#antigravity-cli)
  (requires Google account)

## Installation Steps

<!--@include: ../_partials/setup-by-ai.md-->

### 1. Configure Antigravity CLI

Add Producer Pal to `~/.gemini/config/mcp_config.json`. The
[Google Antigravity](./antigravity) app reads the same file, so this sets up
both.

::: warning Still using the deprecated Gemini CLI?

Edit `~/.gemini/settings.json` instead, and use `httpUrl` in place of
`serverUrl` for the HTTP option.

:::

<!--@include: ../_partials/mcp-option-npx.md-->

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": ["-y", "producer-pal@latest"]
    }
  }
}
```

::: tip Scripting or building against Producer Pal?

<!--@include: ../_partials/scripting-tip-intro.md-->

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": [
        "-y",
        "producer-pal@latest",
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
      "args": ["-y", "producer-pal@latest", "--tools", "core,clip,track"]
    }
  }
}
```

<!--@include: ../_partials/toolset-tip.md-->

:::

<!--@include: ../_partials/mcp-option-http.md-->

```json
{
  "mcpServers": {
    "producer-pal": {
      "serverUrl": "http://localhost:3350/mcp"
    }
  }
}
```

### 2. Start Antigravity CLI

Run `agy` in an empty folder (so it can focus on Producer Pal instead of coding)

### 3. Verify Tools

Run `/mcp` in the Antigravity CLI to confirm the Producer Pal server is
connected.

### 4. Start Using Producer Pal

With Live open, start a conversation with "connect to ableton". Allow Producer
Pal tools when Antigravity tries to use them.

<!--@include: ../_partials/setup-by-ai-finish.md-->

<!--@include: ../_partials/check-it-works.md-->

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
