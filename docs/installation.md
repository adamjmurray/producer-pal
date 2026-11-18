---
title: Installation Guide
description:
  How to install Producer Pal — the Ableton MCP server that brings AI to Ableton
  Live. Setup guides for Claude, Gemini, ChatGPT, Ollama, and more.
---

# Installation Guide

Producer Pal is a free, open-source Ableton MCP server that brings AI to Ableton
Live. It works with many AI providers — use whichever you prefer.

::: tip Requirements

**Requires:** [Ableton Live 12.3+](https://www.ableton.com/live/) with
[Max for Live](https://www.ableton.com/live/max-for-live/). Live 12.4 or later
is recommended — some features don't work on older versions of Live. Use the
version of Max bundled with Live, or make sure your standalone Max is up to
date.

:::

Upgrading from a previous version? See the
[upgrading guide](./installation/upgrading).

## Step 1: Choose Your AI {#choose-how-you-want-to-use-it}

Producer Pal is free. The AI it talks to usually isn't. There are three ways to
get one:

| Option                                                     | Cost                 | Best for                           | The catch                                     |
| ---------------------------------------------------------- | -------------------- | ---------------------------------- | --------------------------------------------- |
| [1. Your AI subscription](#option-1-use-your-subscription) | Nothing extra        | Anyone who already pays for an AI  | You use that company's models and app         |
| [2. Pay-as-you-go API keys](#option-2-use-api-keys)        | Pay for what you use | Trying lots of different AI models | Costs more than a subscription                |
| [3. A local model](#option-3-use-a-local-model)            | Free                 | Privacy, offline use, full control | Needs a powerful computer; slower, less smart |

Not sure? If you already have an AI subscription, use it.

### Option 1: Use Your AI Subscription {#option-1-use-your-subscription}

**Recommended if you already pay for Claude, ChatGPT, Gemini or Mistral.** You
add Producer Pal to the app you already have, at no extra cost.

#### Desktop Apps

The most straightforward way: you chat, the AI works in Live.

- **[Claude Desktop](./installation/claude-desktop)** — Anthropic
- **[ChatGPT App](./installation/chatgpt-app)** — OpenAI, with Codex built in
- **[Google Antigravity](./installation/antigravity)** — Google's agent app for
  Gemini
- **[Mistral Vibe](./installation/mistral-vibe)** — Mistral

#### CLI Coding Agents {#command-line}

The most powerful way, if you're comfortable with the terminal. A coding agent
can write scripts that run long sequences of Producer Pal steps, and combine it
with your other tools. See the
[companion skills](/guide/skills#companion-skills) for examples.

- **[Claude Code](./installation/claude-code)** — Anthropic
- **[Codex CLI](./installation/codex-cli)** — OpenAI
- **[Antigravity CLI](./installation/antigravity-cli)** — Google
- **[Mistral Vibe CLI](./installation/mistral-vibe-cli)** — Mistral

Claude Code, Codex CLI and Antigravity CLI can also use the portable
**[Agent Skill](/guide/skills)** instead of MCP: one folder dropped into the
agent's skills directory. (Agent Skill users: follow
[Path B](#path-b-device-first) below.)

### Option 2: Use Pay-As-You-Go API Keys {#option-2-use-api-keys}

No subscription, or want to try other AI models? Get an API key, add some
credit, and chat in Producer Pal's [built-in chat window](/guide/chat-ui). You
pay for what you use, which usually costs more than a subscription.

- **[AI Routers](./installation/ai-routers)** (recommended) — one account,
  nearly any AI model from any company. The best way to experiment.
- **[Provider API Keys](./installation/api-keys)** — a key straight from Google,
  OpenAI, Anthropic or Mistral.

### Option 3: Use a Local Model {#option-3-use-a-local-model}

Run the AI on your own computer: free, private, offline, and nobody else's
rules. But it needs a powerful computer, it's slower, and it doesn't work as
well as the paid options.
[Check if your computer is powerful enough](./installation/choose-local).

- **[Local AI in the Built-in Chat UI](./installation/local-ai)** — Ollama or LM
  Studio runs the model, and you chat in Producer Pal's chat window.
- **[Bionic / LM Studio](./installation/bionic)** — a desktop app that runs the
  model and has its own chat window.

### Something Else?

- **[Other MCP clients](./installation/other-mcp)** — connect any MCP-compatible
  app with [`npx producer-pal`](https://www.npmjs.com/package/producer-pal).
- **[REST API](/guide/rest-api)** — skip the AI and drive Live from your own
  scripts. You only need the device; the remote script adds undo and more.
- **[Choose by provider](./installation/choose-by-provider)** — every option for
  one AI company on one page.

## Step 2: Follow Your Path {#set-it-up}

The guide you picked has every step. Here's the overview: setup takes one of two
paths, depending on your app.

<div class="install-paths" role="group" aria-label="The two setup paths">
  <div class="install-paths-pick">Choose your AI</div>
  <div class="install-paths-split" aria-hidden="true"></div>
  <div class="install-paths-grid">
    <div class="install-path install-path-ai">
      <h3 class="install-path-title">Path A: The AI sets it up</h3>
      <p class="install-path-apps">Claude Desktop, Claude Code, Codex CLI, Antigravity CLI, Mistral Vibe CLI, ChatGPT app, Google Antigravity, Mistral Vibe, Bionic / LM Studio, other MCP clients</p>
      <ol class="install-path-steps">
        <li>Add Producer Pal to your app</li>
        <li>Open Live and say "connect to ableton"</li>
        <li>Restart Live, choose the Control Surface</li>
        <li>Tell the AI you're done; it asks before adding the device</li>
      </ol>
    </div>
    <div class="install-path install-path-device">
      <h3 class="install-path-title">Path B: Device first</h3>
      <p class="install-path-apps">Built-in Chat UI, the Agent Skill, the REST API, other HTTP clients</p>
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

Both paths end with one setting in Live. The remote script takes one free
Control Surface slot and no MIDI, so your other controllers keep working. In
[small model mode](/features#small-model-mode), use Path B.

### Path B: Device First {#path-b-device-first}

For the Agent Skill, web apps, the REST API and other HTTP clients.

Using the built-in Chat UI? Skip this section: the
[Local AI](./installation/local-ai), [AI Routers](./installation/ai-routers) and
[API Keys](./installation/api-keys) guides include these steps.

#### Install the Device {#install-the-device}

1. Download the Max for Live device:

<!--@include: ./_partials/download-device.md-->

2. <!--@include: ./_partials/save-device.md-->

3. <!--@include: ./_partials/add-device.md-->

#### Finish the Installation {#finish-the-installation}

4. On the device, click **Finish installation…** (or **Open Chat UI**, then
   **Settings → Installation**). It opens this tab:

   <img src="/img/producer-pal-chat-settings-installation.png" alt="The Installation tab with the device in the User Library and the remote script not installed yet" width="500"/>

5. Click **Install** next to Control Surface remote script.
6. <!--@include: ./_partials/control-surface.md-->
7. Follow your app's guide from Step 1 to connect it, then say **"connect to
   ableton"**.

The remote script adds clip automation, undo and redo, and loading plug-ins and
Max for Live devices. The User Library copy keeps the device up to date across
all your projects. Details, updating and troubleshooting:
[Remote Script](/guide/remote-script).

## Additional Resources

- **[Upgrading](./installation/upgrading)** - How to update to a new version
- **[Other Options](./installation/advanced)** - Other MCP clients, and remote
  access (web chat through a web tunnel is not recommended)
- **[Troubleshooting](/support/troubleshooting)** - Common issues and solutions
