# Built-in Chat UI

Producer Pal includes a [built-in chat window](/guide/chat-ui) that runs in your
browser. It needs an AI to talk to, and there are three ways to get one:

- **[Local AI](#local-ai)** — runs on your own computer. Free, private and
  offline, but needs a powerful computer.
- **[AI router](#ai-router)** (recommended) — one account, models from every big
  AI company.
- **[Your own API key](#your-own-api-key)** — straight from Google, OpenAI,
  Anthropic or Mistral.

## What You Need

<!--@include: ../_partials/live-requirement.md-->

## 1. Install the Max for Live Device

<!--@include: ../_partials/device-steps.md-->

## 2. Get an AI

### Local AI

The AI runs on your own computer. Free, private and works offline, but less
smart than the online options.

::: warning Needs a powerful computer

An Apple Silicon Mac with lots of memory, or a PC with a strong Nvidia graphics
card (8 GB of video memory at least, 16 GB or more is better). On a regular
laptop, pick one of the online options below.

:::

Local AI takes a few extra steps, so it has its own guides:

- **[Ollama](./ollama)** — the easiest way to start
- **[Bionic / LM Studio](./bionic-chat-ui)** — an app for downloading and
  managing models

[More about running locally →](./choose-local)

### AI Router (Recommended) {#ai-router}

One account gets you AI models from every big company: Claude, Gemini, GPT and
more. Add some credit, then switch models whenever you like. You pay only for
what you use. Not sure which? Use OpenRouter.

#### OpenRouter

1. [Get an OpenRouter API key](https://openrouter.ai/settings/keys)
2. Settings to use in step 3:
   - Provider: **OpenRouter**
   - Model: e.g., `anthropic/claude-sonnet-5.5`, `google/gemini-3.8-flash`

#### Vercel AI Gateway

Needs a credit card on file before it answers any request.

1. [Get a Vercel AI Gateway API key](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys)
2. Settings to use in step 3:
   - Provider: **Vercel AI Gateway**
   - Model: e.g., `anthropic/claude-sonnet-5.5`, `google/gemini-3.8-flash`

### Your Own API Key

An API key is a password-like code from an AI company that lets apps like
Producer Pal use its AI. Each company charges for what you use.

#### Gemini

Any free use Google offers won't last long in a real session. For regular use,
reach Gemini through an [AI router](#ai-router), or use
[Antigravity](./antigravity), Google's own app, with a Google AI subscription.

1. [Get a Gemini API key](https://aistudio.google.com/apikey) (sign in with your
   Google account, then click "Create API Key")
2. Settings to use in step 3:
   - Provider: **Google**
   - Model: `gemini-3.8-flash` (or `gemini-4-argon` for more complex tasks)

#### OpenAI

You need an [OpenAI developer account](https://platform.openai.com) with credit
added. A ChatGPT subscription doesn't cover this. For a flat monthly price, use
the [ChatGPT App](./chatgpt-app) or [ChatGPT web app](./chatgpt-web) instead.

1. [Get an OpenAI API key](https://platform.openai.com/api-keys)
2. Settings to use in step 3:
   - Provider: **OpenAI**
   - Model: e.g., `gpt-6.1-sol`

#### Anthropic

Claude models, direct. See [Using Claude with Producer Pal](./choose-claude) for
the other ways to run Claude.

1. [Get an Anthropic API key](https://console.anthropic.com/settings/keys)
2. Settings to use in step 3:
   - Provider: **Anthropic**
   - Model: e.g., `claude-sonnet-5-5`

#### Mistral

AI models made in France.

1. [Get a Mistral API key](https://console.mistral.ai/home?workspace_dialog=apiKeys)
2. Settings to use in step 3:
   - Provider: **Mistral**
   - Model: e.g., `mistral-large-4`

#### Other Services {#custom-providers}

For advanced users: any service that works like OpenAI's. Get the service's
address ("URL") from its documentation.

- Provider: **Custom (OpenAI-compatible)**
- URL: the service's address, e.g. `https://api.groq.com/openai/v1` for Groq
- Model: the model name, e.g. `llama-3.3-70b-versatile`

## 3. Connect

1. In the Producer Pal device, click "Open Chat UI". The chat opens in your
   browser, and so do its settings the first time.
2. Fill in the provider, model and your API key from step 2, then click "Save".
3. Click "Quick Connect". It says "Connect to Ableton." for you:

![Producer Pal Chat UI conversation](/img/producer-pal-chat-conversation.png)

::: tip Keep an eye on cost

Online AI charges for what you use. Long chats with the smartest models cost the
most, so check your balance on the service's website now and then.

:::

Your API key is stored encrypted in your browser. If you share this computer,
delete the key from settings when you're done.

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
