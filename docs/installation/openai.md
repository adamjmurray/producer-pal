# OpenAI

Use Producer Pal with OpenAI's GPT models through the built-in chat interface.

::: warning Pay-as-you-go Pricing

The OpenAI API uses pay-as-you-go pricing which can add up with long
conversations. Monitor your usage at
[platform.openai.com](https://platform.openai.com/usage). For flat-rate pricing,
use the [Codex App](./codex-app) or [ChatGPT web app](./chatgpt-web) with an
OpenAI subscription instead.

:::

## What You Need

- An [OpenAI account](https://platform.openai.com) with API credits
- [Ableton Live 12.3+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)

## 1. Get an OpenAI API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in with your OpenAI account
3. Create a new API key
4. Copy the key for the next step

## 2. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
and drag it to a MIDI track in Ableton Live.

It should display "Producer Pal Running":

<img src="/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

## 3. Open the Chat UI

In the Producer Pal device, click "Open Chat UI".

## 4. Configure OpenAI

In the chat UI settings:

- Provider: **OpenAI**
- API Key: Paste your key
- Model: `gpt-5.2` (or `gpt-5.3-codex` for complex tasks)

Click "Save".

## 5. Connect

Click "Quick Connect" and say "connect to ableton".

## Privacy Note

Your API key is stored in browser local storage. Use a private browser session
if that concerns you, or delete the key from settings after use.

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
