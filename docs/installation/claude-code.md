# Claude Code

Use Producer Pal with Anthropic's command line coding assistant.

<!--@include: ../_partials/agent-skill-callout.md-->

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Node.js 20+](https://nodejs.org/en/download)
- [Claude Code](https://www.anthropic.com/claude-code) (requires Anthropic
  account, and a paid subscription at time of writing)

## Installation Steps

<!--@include: ../_partials/setup-by-ai.md-->

### 1. Configure Claude Code

<!--@include: ../_partials/mcp-option-npx.md-->

```bash
claude mcp add producer-pal npx producer-pal@latest
```

::: tip Scripting or building against Producer Pal?

<!--@include: ../_partials/scripting-tip-intro.md-->

```bash
claude mcp add producer-pal -- npx producer-pal@latest --format json --notation midi-json
```

The `--` separates them from `claude mcp add`'s own options.

<!--@include: ../_partials/scripting-tip.md-->

:::

::: tip Only need some of the tools?

Narrow the toolset and every conversation gets smaller:

```bash
claude mcp add producer-pal -- npx producer-pal@latest --tools core,clip,track
```

<!--@include: ../_partials/toolset-tip.md-->

:::

<!--@include: ../_partials/mcp-option-http.md-->

```bash
claude mcp add --transport http producer-pal http://localhost:3350/mcp
```

### 2. Start Claude Code

Run `claude` in an empty folder (so it can focus on Producer Pal instead of
coding)

### 3. Verify Tools

Run `/mcp` in Claude Code to confirm the Producer Pal tools are available:

![Producer Pal tools listed in Claude Code](/img/claude-code-tool-list.png)

![Producer Pal tools listed in Claude Code (continued)](/img/claude-code-tool-list2.png)

### 4. Start Using Producer Pal

With Live open, start a conversation with "connect to ableton". Allow Producer
Pal tools when Claude tries to use them:

![Claude Code tool permission prompt](/img/claude-code-permissions.png)

<!--@include: ../_partials/setup-by-ai-finish.md-->

![Claude Code successfully connected to Producer Pal](/img/claude-code-success.png)

<!--@include: ../_partials/check-it-works.md-->

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
