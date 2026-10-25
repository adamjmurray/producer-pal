# Gemini

Use Producer Pal with Google's Gemini AI through the built-in chat interface.

::: warning Expect to pay for regular use

Any free use Google offers won't last long in a real session. For regular use,
reach Gemini through an [AI router](./chat-ui-other-providers#openrouter) and
pay only for what you use. Or use [Antigravity](./antigravity), Google's own
app, where a Google AI subscription lets you send more.

:::

## What You Need

- A Google account

<!--@include: ../_partials/live-requirement.md-->

## 1. Get a Gemini API Key

An API key is a password-like code that lets Producer Pal use Gemini with your
Google account.

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key for the next step

## 2. Install the Max for Live Device

<!--@include: ../_partials/device-steps.md-->

## 3. Open the Chat UI

In the Producer Pal device, click "Open Chat UI".

## 4. Configure Gemini

In the chat UI settings:

- Provider: **Google**
- API Key: Paste your key
- Model: `gemini-3.8-flash` (or `gemini-4-argon` for more complex tasks)

Click "Save".

## 5. Connect

Click "Quick Connect". It says "Connect to Ableton." for you:

![Producer Pal Chat UI conversation](/img/producer-pal-chat-conversation.png)

<!-- TODO: Embed YouTube video walkthrough -->

## Privacy Note

Your API key is stored encrypted in your browser. If you share this computer,
delete the key from settings when you're done.

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
