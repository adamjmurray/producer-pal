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

::: tip Requirements

**Requires:** [Ableton Live 12.3+](https://www.ableton.com/live/) with
[Max for Live](https://www.ableton.com/live/max-for-live/). Live 12.4 or later
is recommended — some features don't work on older versions of Live. Use the
version of Max bundled with Live, or make sure your standalone Max is up to
date.

:::

Upgrading from a previous version? See the
[upgrading guide](./installation/upgrading).

## Step 1: Pick Your App {#choose-how-you-want-to-use-it}

Producer Pal works the same with any provider. The main choice is _how_ you want
to interact with it, and that decides your setup path:

<div class="install-paths" role="group" aria-label="The two setup paths">
  <div class="install-paths-pick">Pick your app</div>
  <div class="install-paths-split" aria-hidden="true"></div>
  <div class="install-paths-grid">
    <div class="install-path install-path-ai">
      <h3 class="install-path-title">Path A: The AI sets it up</h3>
      <p class="install-path-apps">Claude Desktop, Claude Code, Codex CLI, Gemini CLI, Mistral Vibe, ChatGPT app, Antigravity, Bionic / LM Studio, other MCP clients</p>
      <ol class="install-path-steps">
        <li>Add Producer Pal to your app</li>
        <li>Open Live and say "connect to ableton"</li>
        <li>Restart Live, choose the Control Surface</li>
        <li>Tell the AI you're done; it asks before adding the device</li>
      </ol>
    </div>
    <div class="install-path install-path-device">
      <h3 class="install-path-title">Path B: Device first</h3>
      <p class="install-path-apps">Built-in Chat UI, web apps (claude.ai, ChatGPT, Le Chat), the Agent Skill, the REST API, other HTTP clients</p>
      <ol class="install-path-steps">
        <li>Download the device</li>
        <li>Save it to your User Library</li>
        <li>Drag it onto a MIDI track</li>
        <li>Click "Finish installation…" and install the remote script</li>
        <li>Restart Live, choose the Control Surface</li>
        <li>Follow your app's guide to connect it, then say "connect to ableton"</li>
      </ol>
    </div>
  </div>
</div>

Most groups below support several AI providers, so pick the experience you like
best. Or skip the AI and drive Live from your own code.

### Desktop Apps

<span class="path-badge path-badge-ai">Path A: the AI sets it up</span>

Dedicated AI apps — the easiest setup for most people:

- **[Claude Desktop](./installation/claude-desktop)** — Anthropic's desktop app
  (subscription required)
- **[ChatGPT App](./installation/chatgpt-app)** — OpenAI's desktop app, with
  Codex built in
- **[Antigravity](./installation/antigravity)** — Google's agent app for Gemini
  (a Google AI subscription recommended)
- **[Bionic / LM Studio](./installation/bionic)** — runs models fully offline,
  no account needed

### Built-in Chat UI

<span class="path-badge path-badge-device">Path B: device first</span>

Producer Pal's own chat window, in your browser. Pick where the AI comes from:

- **[Local AI](./installation/choose-local)** — runs on your own computer. Free,
  private and offline, but less smart. **Needs a powerful computer:** an Apple
  Silicon Mac with lots of memory, or a PC with a strong Nvidia graphics card.
- **AI router** (recommended) — one account, models from every big AI company.
  Pay for what you use. [OpenRouter](./installation/chat-ui#openrouter) or
  [Vercel AI Gateway](./installation/chat-ui#vercel-ai-gateway).
- **[Your own API key](./installation/chat-ui#your-own-api-key)** — already have
  a key from Google, OpenAI, Anthropic or Mistral? Use it here.

### Command Line

<span class="path-badge path-badge-ai">Path A: the AI sets it up</span>

For users comfortable with the terminal:

- **[Claude Code](./installation/claude-code)** — Anthropic (subscription
  required)
- **[Codex CLI](./installation/codex-cli)** — OpenAI (subscription required)
- **[Gemini CLI](./installation/gemini-cli)** — Google (subscription
  recommended)
- **[Mistral Vibe](./installation/mistral-vibe)** — Mistral (API key required)

Claude Code, Codex CLI, and Gemini CLI can also use the portable
**[Agent Skill](/guide/skills)** instead of MCP — one folder dropped into the
agent's skills directory, no MCP config. (Agent Skill users: follow Path B.)

### Web Apps

<span class="path-badge path-badge-device">Path B: device first</span>

Use a provider's website in your browser — each requires a
[web tunnel](./installation/web-tunnels):

- **[claude.ai](./installation/claude-web)** — Anthropic
- **[ChatGPT](./installation/chatgpt-web)** — OpenAI
- **[Le Chat](./installation/mistral-le-chat)** — Mistral

### Any MCP Client

<span class="path-badge path-badge-ai">Path A: the AI sets it up</span>

Already have an MCP-compatible app? Connect directly with
[`npx producer-pal`](https://www.npmjs.com/package/producer-pal) — see
[Other MCP LLMs](./installation/other-mcp).

### Scripts and Automation

<span class="path-badge path-badge-device">Path B: device first</span>

Skip the AI entirely. The [REST API](/guide/rest-api) is plain HTTP on the same
port the device already serves, so any script, language, or tool that can make a
request can read and edit your Live Set. You only need the device; the remote
script adds undo and more.

### Prefer to Pick by AI Provider?

If you already know which AI you use, jump straight to its provider guide:
[Claude / Anthropic](./installation/choose-claude) ·
[OpenAI / ChatGPT](./installation/choose-openai) ·
[Google / Gemini](./installation/choose-gemini) ·
[Mistral](./installation/choose-mistral) ·
[Local / Offline](./installation/choose-local) ·
[Multiple Providers](./installation/choose-multi)

## Step 2: Follow Your Path {#set-it-up}

Both paths end with one setting in Live. The remote script takes one free
Control Surface slot and no MIDI, so your other controllers keep working.

### Path A: The AI Sets It Up {#the-ai-sets-it-up}

For apps marked **Path A** above. This works when the app connects through
`npx producer-pal` or the Claude Desktop extension. Over HTTP, or in
[small model mode](/features#small-model-mode), use Path B.

1. Open your app's guide from Step 1 and add Producer Pal to the app.
2. Open Live, start a chat, and say **"connect to ableton"**. The AI installs
   the [remote script](/guide/remote-script).
3. <!--@include: ./_partials/control-surface.md-->
4. Then tell the AI you're done. It asks before adding the Producer Pal device
   to your Live Set.

### Path B: Device First {#path-b-device-first}

For everything else: the Chat UI, web apps, the Agent Skill, the REST API and
other HTTP clients.

#### Install the Device {#install-the-device}

1. Download the Max for Live device:

<!--@include: ./_partials/download-device.md-->

2. <!--@include: ./_partials/save-device.md-->

3. <!--@include: ./_partials/add-device.md-->

#### Finish the Installation {#finish-the-installation}

4. On the device, click **Finish installation…** (or **Open Chat UI**, then
   **Settings → Installation**).
5. Click **Install** next to Remote script.
6. <!--@include: ./_partials/control-surface.md-->
7. Follow your app's guide from Step 1 to connect it, then say **"connect to
   ableton"**.

<!-- TODO screenshot: Installation tab -->

The remote script adds clip automation, undo and redo, and loading plug-ins and
Max for Live devices. The User Library copy keeps the device up to date across
all your projects. Details, updating and troubleshooting:
[Remote Script](/guide/remote-script).

## Additional Resources

- **[Upgrading](./installation/upgrading)** - How to update to a new version
- **[Web Tunnels](./installation/web-tunnels)** - Setup remote access (for web
  apps)
- **[Troubleshooting](/support/troubleshooting)** - Common issues and solutions
