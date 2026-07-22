# Using Gemini with Producer Pal

Google's Gemini models integrate well with Producer Pal through multiple
options. A free tier is available with rate limits for trying out Producer Pal.

## Options

| Option                       | Best For   | Trade-offs                                                        |
| ---------------------------- | ---------- | ----------------------------------------------------------------- |
| [Built-in Chat UI](./gemini) | Most users | Native integration, easy setup. Free tier has strict rate limits. |
| [Gemini CLI](./gemini-cli)   | Developers | Terminal-based. Google AI subscription increases CLI limits.      |

## Recommendation

**Built-in Chat UI with Gemini** is the simplest path to a first try. Get a
[free API key](https://aistudio.google.com/apikey) to get started — but expect
to hit the free tier's strict rate limits within moments during an active
session. For sustained use, add pay-as-you-go billing or switch to another
provider.

## Model Notes

- Gemini 3.6 Flash or Gemini 3.1 Pro recommended
- Free tier: expect to hit rate limits quickly, even in short sessions
- When you outgrow the free tier:
  - [OpenRouter](./chat-ui-other-providers#openrouter) with Gemini - simplest
    paid option
  - [Gemini CLI](./gemini-cli) with a Google AI subscription - higher limits
    without API billing setup
