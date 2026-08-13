---
title: Installation Guide
description:
  How to install Producer Pal — the Ableton MCP server that brings AI to Ableton
  Live. Setup guides for Claude, Gemini, ChatGPT, Ollama, and more.
---

# Installation Guide

Producer Pal is a free, open-source Ableton MCP server that brings AI to Ableton
Live. It works with many AI providers — use whichever you prefer. Note that some
AI services charge for usage.

<div class="download-band download-band-compact">
  <h2 class="download-title">Step 1: Get the Max for Live Device</h2>
  <p class="download-subtitle">Required for every setup — add it to a MIDI track in Ableton Live.</p>
  <div class="download-actions">
    <a class="download-btn download-btn-primary" href="https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd">
      <span class="download-btn-label">Download Max for Live Device</span>
      <span class="download-btn-sub">Producer_Pal.amxd · v{{ $frontmatter.version }}</span>
    </a>
  </div>
</div>

::: tip Requirements

**Requires:** [Ableton Live 12.3+](https://www.ableton.com/live/) with
[Max for Live](https://www.ableton.com/live/max-for-live/). Live 12.4 or later
is recommended — some features don't work on older versions of Live. Use the
version of Max bundled with Live, or make sure your standalone Max is up to
date.

Upgrading from a previous version? See the
[upgrading guide](./installation/upgrading).

:::

## Choose How You Want to Use It

Producer Pal works the same with any provider — the main choice is _how_ you
want to interact with it. Most groups below support multiple AI providers, so
pick the experience you like best. Or skip the AI and drive Live from your own
code.

### Desktop Apps

Dedicated AI apps — the easiest setup for most people:

- **[Claude Desktop](./installation/claude-desktop)** — Anthropic's desktop app
  (subscription required)
- **[ChatGPT App](./installation/chatgpt-app)** — OpenAI's desktop app, with
  Codex built in (macOS and Windows)
- **[Bionic (LM Studio)](./installation/bionic)** — runs models fully offline,
  no account needed

### Built-in Chat UI

Producer Pal's own browser-based chat — bring an API key for any supported
provider:

- **[Chat UI overview](./installation/chat-ui)** — supported providers and setup
- **[Gemini](./installation/gemini)**, **[OpenAI](./installation/openai)**,
  **[Ollama](./installation/ollama)** (offline), or
  **[Anthropic, OpenRouter, Mistral & more](./installation/chat-ui-other-providers)**

### Command Line

For users comfortable with the terminal:

- **[Claude Code](./installation/claude-code)** — Anthropic (subscription
  required)
- **[Codex CLI](./installation/codex-cli)** — OpenAI (subscription required)
- **[Gemini CLI](./installation/gemini-cli)** — Google (free tier has strict
  rate limits)
- **[Mistral Vibe](./installation/mistral-vibe)** — Mistral (API key required)

Claude Code, Codex CLI, and Gemini CLI can also use the portable
**[Agent Skill](/guide/skills)** instead of MCP — one folder dropped into the
agent's skills directory, no MCP config.

### Web Apps

Use a provider's website in your browser — each requires a
[web tunnel](./installation/web-tunnels):

- **[claude.ai](./installation/claude-web)** — Anthropic
- **[ChatGPT](./installation/chatgpt-web)** — OpenAI
- **[Le Chat](./installation/mistral-le-chat)** — Mistral

### Any MCP Client

Already have an MCP-compatible app? Connect directly with
[`npx producer-pal`](https://www.npmjs.com/package/producer-pal) — see
[Other MCP LLMs](./installation/other-mcp).

### Scripts and Automation

Skip the AI entirely. The [REST API](/guide/rest-api) is plain HTTP on the same
port the device already serves, so any script, language, or tool that can make a
request can read and edit your Live Set. Nothing to install beyond the device.

## Prefer to Pick by AI Provider?

If you already know which AI you use, jump straight to its provider guide:
[Claude / Anthropic](./installation/choose-claude) ·
[OpenAI / ChatGPT](./installation/choose-openai) ·
[Google / Gemini](./installation/choose-gemini) ·
[Mistral](./installation/choose-mistral) ·
[Local / Offline](./installation/choose-local) ·
[Multiple Providers](./installation/choose-multi)

## Additional Resources

- **[Upgrading](./installation/upgrading)** - How to update to a new version
- **[Web Tunnels](./installation/web-tunnels)** - Setup remote access (for web
  apps)
- **[Troubleshooting](/support/troubleshooting)** - Common issues and solutions
