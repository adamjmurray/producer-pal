# Gemini

The easiest way to use Producer Pal. Google's free tier has generous daily
quotas.

## What You Need

- A Google account
- [Ableton Live 12.2+](https://www.ableton.com/live/) with
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

![Producer Pal device running in Ableton Live](/device-main-tab.png)

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

![Producer Pal Chat UI](/built-in-chat-ui.png)

<!-- TODO: Embed YouTube video walkthrough -->

## Privacy Note

Your API key is stored in browser local storage. Use a private browser session
if that concerns you, or delete the key from settings after use.

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](./troubleshooting).
