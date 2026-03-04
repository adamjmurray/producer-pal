# Codex App

OpenAI's Codex desktop app is an easy way to use Producer Pal with an OpenAI
subscription. It supports MCP natively, so setup is straightforward.

::: warning macOS Only

The Codex app is currently available for macOS (Apple Silicon) only. Windows and
Linux support is coming. For other platforms, see [Codex CLI](./codex-cli) or
[ChatGPT web app](./chatgpt-web).

:::

## Requirements

- [Ableton Live 12.3+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)
- [Node.js 22+](https://nodejs.org/en/download)
- [Codex app](https://openai.com/index/introducing-codex/) (requires OpenAI
  account with ChatGPT Plus, Pro, Business, or Enterprise plan)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

<img src="/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

_It should display "Producer Pal Running" or something isn't working._

### 2. Add Producer Pal to Codex

In the Codex app, go to Settings and add a new MCP server:

- Name: `producer-pal`
- Command: `npx`
- Arguments: `-y producer-pal`

<!-- TODO: screenshot of Codex app MCP settings -->

### 3. Start Using Producer Pal

Start a conversation with "connect to ableton":

<!-- TODO: screenshot of successful connection in Codex app -->

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
