# Using Multiple AI Providers

Want flexibility to switch between providers or access many models? OpenRouter
and the Built-in Chat UI support this.

## Options

| Option                                        | Best For              | Trade-offs                                           |
| --------------------------------------------- | --------------------- | ---------------------------------------------------- |
| [Built-in Chat UI](./chat-ui-other-providers) | Provider flexibility  | Supports OpenRouter, direct APIs. Requires API keys. |
| [OpenRouter](https://openrouter.ai)           | Access to 100+ models | Single API key, pay-per-use. Configure via Chat UI.  |

## Why Multiple Providers?

- **Cost optimization:** Use cheaper models for simple tasks, powerful ones for
  complex work
- **Availability:** Fallback options when one provider is down or rate-limited
- **Experimentation:** Compare how different models handle musical tasks
- **EU data sovereignty:** Access Mistral models via OpenRouter for EU-compliant
  option

## Setup

Use the [Built-in Chat UI](./chat-ui) with OpenRouter:

1. Get an [OpenRouter API key](https://openrouter.ai/keys)
2. In Producer Pal Chat UI, select OpenRouter as provider
3. Enter your API key
4. Choose from available models

## Recommended Models via OpenRouter

- **Gemini 3 Flash**
- **Claude Sonnet 4.5**
- **GPT-4.5**
- **Mistral Large**
