# AI Routers and API Keys

Set up the built-in chat UI with an AI router (OpenRouter or Vercel AI Gateway)
or with your own key from Anthropic, Mistral, OpenAI or another service. Not
sure? Use OpenRouter.

<!--@include: ../_partials/download-device.md-->

::: warning You pay for what you use

Most of these services charge per message. Long chats with the smartest models
cost the most, so check your balance on the service's website now and then.

:::

## Setup Steps

1. Download
   [Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
   and [install it](/installation#install-the-device) to your User Library, then
   drag it from there onto a MIDI track
2. Finish the installation: install the remote script and choose the Control
   Surface. See [Finish the Installation](/installation#finish-the-installation)
3. In the Producer Pal device, click "Open Chat UI"
4. Configure your provider as described below
5. Click "Quick Connect". It says "Connect to Ableton." for you.

## AI Router (Recommended)

### OpenRouter

[OpenRouter](https://openrouter.ai) is an AI router: hundreds of AI models in
one place. Includes free and pay-as-you-go options.

1. [Get an OpenRouter API key](https://openrouter.ai/settings/keys)
2. In the chat UI settings:
   - Provider: **OpenRouter**
   - API Key: Your key
   - Model: e.g., `anthropic/claude-sonnet-5.5`, `google/gemini-3.8-flash`

### Vercel AI Gateway

[Vercel AI Gateway](https://vercel.com/ai-gateway) is another AI router with
hundreds of models in one place, at the providers' own prices. It needs a credit
card on file before it answers any request, even on its free monthly credits.

1. [Get a Vercel AI Gateway API key](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys)
2. In the chat UI settings:
   - Provider: **Vercel AI Gateway**
   - API Key: Your key
   - Model: e.g., `anthropic/claude-sonnet-5.5`, `google/gemini-3.8-flash`

## Your Own API Key

### Anthropic

[Anthropic](https://console.anthropic.com/) offers Claude models directly via
API key. See [Using Claude with Producer Pal](./choose-claude) for the other
ways to run Claude.

1. [Get an Anthropic API key](https://console.anthropic.com/settings/keys)
2. In the chat UI settings:
   - Provider: **Anthropic**
   - API Key: Your key
   - Model: e.g., `claude-sonnet-5-5`

### Mistral

[Mistral](https://mistral.ai/) offers AI models developed in France. Free tier
available with fairly aggressive quotas.

1. [Get a Mistral API key](https://console.mistral.ai/home?workspace_dialog=apiKeys)
2. In the chat UI settings:
   - Provider: **Mistral**
   - API Key: Your key
   - Model: e.g., `mistral-large-4`

### OpenAI API

[OpenAI](https://openai.com/api/) offers GPT models with pay-as-you-go pricing.
For detailed setup, see the [dedicated OpenAI guide](./openai).

1. [Get an OpenAI API key](https://platform.openai.com/api-keys)
2. In the chat UI settings:
   - Provider: **OpenAI**
   - API Key: Your key
   - Model: e.g., `gpt-6.1-sol`

::: tip Subscription Alternative

Prefer flat-rate pricing? The [ChatGPT App](./chatgpt-app) or
[Codex CLI](./codex-cli) work with OpenAI's subscription plans.

:::

## Custom Providers

For other OpenAI-compatible providers:

1. In the chat UI settings:
   - Provider: **Custom (OpenAI-compatible)**
   - API Key: Your provider's key
   - URL: Your provider's API endpoint
   - Model: The model name

### Example: Groq

- Provider: Custom (OpenAI-compatible)
- URL: `https://api.groq.com/openai/v1`
- Model: `llama-3.3-70b-versatile`

## Privacy Note

Your API key is stored encrypted in your browser. If you share this computer,
delete the key from settings when you're done.

## Troubleshooting

If the built-in chat doesn't work, see the
[Troubleshooting Guide](/support/troubleshooting).
