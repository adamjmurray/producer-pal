# Gemini

Use Producer Pal with Google's Gemini AI through the built-in chat interface.

::: warning Free Tier Limitations

Google's free tier has strict rate limits. You'll likely hit quotas within
moments. Consider [Claude Desktop](./claude-desktop) for a more reliable
experience, or using Gemini through a LLM aggregator like
[OpenRouter](/installation/chat-ui-other-providers#openrouter). You can also add
billing to your Google Cloud account and setup a pay-as-you go API key, but this
is not recommended for personal use.

:::

## What You Need

- A Google account
- [Ableton Live 12.3+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)

## 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key for the next step

## 2. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
and drag it to a MIDI track in Ableton Live.

It should display "Producer Pal Running":

<img src="/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

## 3. Open the Chat UI

In the Producer Pal device, click "Open Chat UI".

## 4. Configure Gemini

In the chat UI settings:

- Provider: **Google Gemini**
- API Key: Paste your key
- Model: `gemini-2.5-flash` (or `gemini-2.5-pro` for more complex tasks)

Click "Save".

## 5. Connect

Click "Quick Connect" and say "connect to ableton":

![Producer Pal Chat UI conversation](/producer-pal-chat-conversation.png)

<!-- TODO: Embed YouTube video walkthrough -->

## Privacy Note

Your API key is stored in browser local storage. Use a private browser session
if that concerns you, or delete the key from settings after use.

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](./troubleshooting).
