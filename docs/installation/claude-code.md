# Claude Code

Use Producer Pal with Anthropic's command line coding assistant.

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Node.js 20+](https://nodejs.org/en/download)
- [Claude Code](https://www.anthropic.com/claude-code) (requires Anthropic
  account, and a paid subscription at time of writing)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

<img src="/img/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

_It should display "Producer Pal Running" or something isn't working._

### 2. Configure Claude Code

**Option A: With npx (recommended)** - Allows flexible startup order and
auto-reconnection:

```bash
claude mcp add producer-pal npx producer-pal
```

::: tip Scripting or building against Producer Pal?

If you'll have the agent **write code that generates or parses** Producer Pal
data — building MIDI programmatically, or piping tool output through JSON
tooling — add `--format json --notation midi-json` (the `--` separates them from
`claude mcp add`'s own options):

```bash
claude mcp add producer-pal -- npx producer-pal --format json --notation midi-json
```

`--format json` returns standard JSON instead of the token-optimized compact
form, and `midi-json` represents notes as a JSON array the agent can generate
and read directly.

For a **normal music-making conversation**, keep the defaults (compact output,
bar|beat notation) — they use fewer tokens and the agent reads them fine.

Both are global device settings, so they also change what the chat UI and any
other connected clients see.

:::

**Option B: Direct HTTP** - Requires Ableton running first, no
auto-reconnection:

```bash
claude mcp add --transport http producer-pal http://localhost:3350/mcp
```

### 3. Start Claude Code

Run `claude` in an empty folder (so it can focus on Producer Pal instead of
coding)

### 4. Verify Tools

Run `/mcp` in Claude Code to confirm the Producer Pal tools are available:

![Producer Pal tools listed in Claude Code](/img/claude-code-tool-list.png)

![Producer Pal tools listed in Claude Code (continued)](/img/claude-code-tool-list2.png)

### 5. Start Using Producer Pal

1. Start a conversation with "connect to ableton"
2. Allow Producer Pal tools to be used when Claude tries to use them:

![Claude Code tool permission prompt](/img/claude-code-permissions.png)

![Claude Code successfully connected to Producer Pal](/img/claude-code-success.png)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
