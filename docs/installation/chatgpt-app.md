# ChatGPT App

OpenAI's ChatGPT desktop app is an easy way to use Producer Pal with an OpenAI
account.

::: info Formerly the Codex app

In July 2026, OpenAI merged the Codex app into the ChatGPT desktop app, which
now has Chat, Work, and Codex together in one app. If you had the Codex app
installed, it updated into this app and kept your projects and settings. (The
older ChatGPT desktop app is now called "ChatGPT Classic" and does not work with
Producer Pal.)

:::

::: warning macOS and Windows Only

The ChatGPT desktop app runs on macOS (Apple Silicon) and Windows. On Linux, see
[Codex CLI](./codex-cli) or the [ChatGPT web app](./chatgpt-web).

:::

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Node.js 22+](https://nodejs.org/en/download)
- [ChatGPT desktop app](https://chatgpt.com/download) (requires an OpenAI
  account)

<!-- TODO: confirm the download URL above lands on the new unified desktop app (not ChatGPT Classic). -->
<!-- TODO: OpenAI says Chat, Work, and Codex are on every plan including Free. Confirm Producer Pal
     actually works on a free account (MCP servers may be gated, and free usage limits may make it
     impractical). If it needs a paid plan, say so here. -->

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

<img src="/img/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

_It should display "Producer Pal Running" or something isn't working._

### 2. Add Producer Pal to ChatGPT

In the ChatGPT app, go to Settings &rarr; Plugins &rarr; MCPs and click "+ Add
server":

<!-- TODO: replace screenshot with the new app's MCP Servers settings page (below is the old Codex app). -->

<img src="/img/codex-app-mcp-server-settings.png" alt="ChatGPT app MCP Servers settings page" width="650"/><br>

**Option A: With npx (recommended)** — Allows flexible startup order and
auto-reconnection:

Select the **STDIO** tab and fill in:

- **Name:** `Producer Pal`
- **Command to launch:** `npx`
- **Arguments:** `-y` and `producer-pal` as separate entries (click "+ Add
  argument" for each one)

<!-- TODO: replace screenshot with the new app's STDIO form. -->

<img src="/img/codex-app-add-mcp-stdio.png" alt="STDIO MCP configuration for Producer Pal" width="650"/><br>

**Option B: Direct HTTP** — Requires Ableton running first, no
auto-reconnection:

Select the **Streamable HTTP** tab and fill in:

- **Name:** `Producer Pal`
- **URL:** `http://localhost:3350/mcp`

<!-- TODO: replace screenshot with the new app's Streamable HTTP form. -->

<img src="/img/codex-app-add-mcp-http.png" alt="Streamable HTTP MCP configuration for Producer Pal" width="650"/>

Save the server, then click **Restart** so ChatGPT picks it up.

<!-- TODO: confirm the exact Save/Restart wording and whether a restart of the whole app is needed. -->

::: tip Shared with Codex CLI

The desktop app, [Codex CLI](./codex-cli), and the Codex IDE extension share the
same MCP configuration (`~/.codex/config.toml`), so adding Producer Pal in one
place makes it available in the others.

:::

### 3. Start a Conversation

Before your first message, the app asks you to choose where to work. It's
recommended to use an empty folder for Producer Pal sessions (shown as
`producer-pal-workspace` in the screenshot). Feel free to put reference
documents in this folder, such as common workflow instructions or details of
your preferred musical style and production techniques.

<!-- TODO: the new app offers Chat, Work, and Codex for a task. Confirm which one to tell people to
     use with Producer Pal (Chat is the natural fit for music, but MCP servers are configured on the
     Codex host, so they may only be available in the Codex view). Rewrite this section around the
     answer, including whether choosing a folder is still required. -->

Start a conversation with "connect to ableton":

<!-- TODO: replace screenshot with the new app's conversation start screen. -->

<img src="/img/codex-app-conversation-start.png" alt="Starting a conversation in the ChatGPT app" width="600"/>

### 4. Verify Connection

You should see a successful connection to Ableton Live:

<!-- TODO: replace screenshot with the new app's connected state. -->

<img src="/img/codex-app-connected.png" alt="ChatGPT app successfully connected to Producer Pal" width="600"/>

You can also type `/mcp` in the composer to list connected MCP servers and
confirm the Producer Pal tools are available.

<!-- TODO: confirm /mcp works in the desktop app (it is documented, but there are reports of it
     listing servers without exposing their tools). -->

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
