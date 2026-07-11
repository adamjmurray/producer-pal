# Claude Desktop Installation

Anthropic's Claude Desktop app is one of the easiest (and recommended) ways to
use Producer Pal.

## Requirements

<div class="download-band download-band-compact download-band-dual">
  <p class="download-subtitle">Grab both downloads, then follow the steps below:</p>
  <div class="download-actions">
    <a class="download-btn download-btn-primary" href="https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd">
      <span class="download-btn-label">1. Max for Live Device</span>
      <span class="download-btn-sub">Producer_Pal.amxd — for Ableton Live</span>
    </a>
    <a class="download-btn download-btn-primary" href="https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb">
      <span class="download-btn-label">2. Claude Desktop Extension</span>
      <span class="download-btn-sub">Producer_Pal.mcpb — for Claude Desktop</span>
    </a>
  </div>
</div>

- [Ableton Live 12.3+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/). Live 12.4 or later
  is recommended — some features don't work on older versions of Live. Use the
  version of Max bundled with Live, or make sure your standalone Max is up to
  date.
- [Claude Desktop](https://claude.ai/download) (requires Anthropic account)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

<img src="/img/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

_It should display "Producer Pal Running" or something isn't working._

### 2. Download the Claude Desktop Extension

Download the
[Producer Pal Claude Desktop Extension (`Producer_Pal.mcpb`)](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)

### 3. Install the Extension in Claude Desktop

Go to Claude Desktop → Settings → Extensions and:

**If you already have extensions installed**, drag and drop `Producer_Pal.mcpb`
into the Extensions screen:

![Install in Claude Desktop](/img/install-in-claude.png)

**Or, if you have never installed a Claude Desktop extension before**, you need
to click "Advanced settings" on the Extensions screen, then click "Install
extension...", and choose the
[Producer_Pal.mcpb](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)
file.

![Install first extension in Claude Desktop](/img/install-in-claude-first-extension.png)

### 4. Complete the Installation

Don't forget to click "Install" and complete the Claude Desktop installation:

![Install in Claude Desktop, part 2](/img/install-in-claude-2.png)

**About the security warning:** Anthropic displays this warning for all
extensions as a general security measure. Producer Pal is open source and you
can review the entire codebase on
[GitHub](https://github.com/adamjmurray/producer-pal) before installing. The
extension only accesses Ableton Live through the Max for Live device.

### 5. Verify Installation

You should see Producer Pal tools in Claude's "Connectors" menu (make sure it's
enabled when starting a conversation):

![Producer Pal tools in Claude](/img/tools-in-claude.png)

### 6. Start Using Producer Pal

1. Start a conversation with "connect to ableton"
2. Allow Producer Pal tools to be used when Claude tries to use them:

![Producer Pal allow tools](/img/producer-pal-permission.png)

![Producer Pal start a conversation](/img/screenshot.png)

## Advanced settings

The extension exposes a few optional settings under **Claude Desktop → Settings
→ Extensions → Producer Pal**. Most people never need to touch these — the
defaults are recommended. **Restart the extension after changing any of them.**

- **Ableton device URL** — where to reach the Max for Live device (default
  `http://localhost:3350`). Change only if you moved the device's port or are
  connecting over the network.
- **MIDI notation** — overrides how Producer Pal reads and writes clip notes.
  Three valid values: `barbeat` (recommended for Claude Sonnet, Opus, and
  Fable), `stark` (pairs well with **Small model mode**), or `midi-json` (pairs
  well with **JSON output**). Leave blank, or enter anything else, to keep the
  device's current setting (`barbeat` by default).
- **Small model mode** — simplifies the tools and instructions for smaller
  models. May improve results with **Claude Haiku**; not recommended otherwise,
  since Claude Sonnet, Opus, and Fable handle the full toolset.
- **Direct Live API** — enables the advanced
  [`ppal-live-api`](/features#ppal-live-api) tool for direct access to the
  [Live Object Model](https://docs.cycling74.com/apiref/lom/). An escape hatch
  for custom control and debugging when the standard tools aren't enough — not
  recommended as a default.
- **JSON output** — returns tool results as JSON instead of the compact default.
  Not recommended for normal use (it increases token usage), but useful when you
  want Claude to run code on the results.

::: info These are global device settings

They're pushed to the device when the extension connects, so they also change in
the [chat UI](/guide/chat-ui) and for any other connected MCP client. The
extension only pushes a setting when you enable a toggle (or enter a notation) —
it never turns off or resets a setting you configured on the device itself.

:::

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
