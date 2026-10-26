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

**Option A: With npx** (recommended for MCP) - Allows flexible startup order and
auto-reconnection:

```bash
claude mcp add producer-pal npx producer-pal@latest
```

::: tip Scripting or building against Producer Pal?

If you're using MCP and will have the agent **write code that generates or
parses** Producer Pal data — building MIDI programmatically, or piping tool
output through JSON tooling — add `--format json --notation midi-json` (the `--`
separates them from `claude mcp add`'s own options):

```bash
claude mcp add producer-pal -- npx producer-pal@latest --format json --notation midi-json
```

<!--@include: ../_partials/scripting-tip.md-->

:::

::: tip Only need some of the tools?

Narrow the toolset and every conversation gets smaller:

```bash
claude mcp add producer-pal -- npx producer-pal@latest --tools core,clip,track
```

<!--@include: ../_partials/toolset-tip.md-->

:::

**Option B: Direct HTTP** - Requires Ableton running first, no
auto-reconnection:

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
