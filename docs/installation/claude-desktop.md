# Claude Desktop Installation

Anthropic's Claude Desktop app is one of the easiest (and recommended) ways to
use Producer Pal.

## Requirements

- [Ableton Live 12.3+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)
- [Claude Desktop](https://claude.ai/download) (requires Anthropic account)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

<img src="/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

_It should display "Producer Pal Running" or something isn't working._

### 2. Download the Claude Desktop Extension

Download the
[Producer Pal Claude Desktop Extension (`Producer_Pal.mcpb`)](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)

### 3. Install the Extension in Claude Desktop

Go to Claude Desktop → Settings → Extensions and:

**If you already have extensions installed**, drag and drop `Producer_Pal.mcpb`
into the Extensions screen:

![Install in Claude Desktop](/install-in-claude.png)

**Or, if you have never installed a Claude Desktop extension before**, you need
to click "Advanced settings" on the Extensions screen, then click "Install
extension...", and choose the
[Producer_Pal.mcpb](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)
file.

![Install first extension in Claude Desktop](/install-in-claude-first-extension.png)

### 4. Complete the Installation

Don't forget to click "Install" and complete the Claude Desktop installation:

![Install in Claude Desktop, part 2](/install-in-claude-2.png)

**About the security warning:** Anthropic displays this warning for all
extensions as a general security measure. Producer Pal is open source and you
can review the entire codebase on
[GitHub](https://github.com/adamjmurray/producer-pal) before installing. The
extension only accesses Ableton Live through the Max for Live device.

### 5. Verify Installation

You should see Producer Pal tools in Claude's "Connectors" menu (make sure it's
enabled when starting a conversation):

![Producer Pal tools in Claude](/tools-in-claude.png)

### 6. Start Using Producer Pal

1. Start a conversation with "connect to ableton"
2. Allow Producer Pal tools to be used when Claude tries to use them:

![Producer Pal allow tools](/producer-pal-permission.png)

![Producer Pal start a conversation](/screenshot.png)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](./troubleshooting).
