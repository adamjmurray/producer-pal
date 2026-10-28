# API Keys

Use a key straight from one AI company. An API key is a password-like code that
lets Producer Pal use your account, and the company charges for what you use.
Want models from every company in one account? [Use an AI router](./ai-routers)
instead.

## What You Need

<!--@include: ../_partials/live-requirement.md-->

## 1. Install the Max for Live Device

<!--@include: ../_partials/device-steps.md-->

## 2. Get an API Key

Pick one company:

### Gemini

Any free use Google offers won't last long in a real session. For regular use,
reach Gemini through an [AI router](./ai-routers), or use
[Google Antigravity](./antigravity) with a Google AI subscription.

1. [Get a Gemini API key](https://aistudio.google.com/apikey) (sign in with your
   Google account, then click "Create API Key")
2. Settings to use in step 3:
   - Provider: **Google**
   - Model: `gemini-3.8-flash` (or `gemini-4-argon` for more complex tasks)

### OpenAI

You need an [OpenAI developer account](https://platform.openai.com) with credit
added. A ChatGPT subscription doesn't cover this. For a flat monthly price, use
the [ChatGPT App](./chatgpt-app) or [ChatGPT web app](./chatgpt-web) instead.

1. [Get an OpenAI API key](https://platform.openai.com/api-keys)
2. Settings to use in step 3:
   - Provider: **OpenAI**
   - Model: e.g., `gpt-6.1-sol`

### Anthropic

Claude models, direct. See [Using Claude with Producer Pal](./choose-claude) for
the other ways to run Claude.

1. [Get an Anthropic API key](https://console.anthropic.com/settings/keys)
2. Settings to use in step 3:
   - Provider: **Anthropic**
   - Model: e.g., `claude-sonnet-5-5`

### Mistral

AI models made in France.

1. [Get a Mistral API key](https://console.mistral.ai/home?workspace_dialog=apiKeys)
2. Settings to use in step 3:
   - Provider: **Mistral**
   - Model: e.g., `mistral-large-4`

### Other Services {#custom-providers}

For advanced users: any service that works like OpenAI's. Get the service's
address ("URL") from its documentation. Settings to use in step 3:

- Provider: **Custom (OpenAI-compatible)**
- URL: the service's address, e.g. `https://api.groq.com/openai/v1` for Groq
- Model: the model name, e.g. `llama-3.3-70b-versatile`

## 3. Connect

<!--@include: ../_partials/chat-ui-connect.md-->

<!--@include: ../_partials/online-ai-notes.md-->

<!--@include: ../_partials/check-it-works.md-->

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
