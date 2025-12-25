# Using Gemini with Producer Pal

Google's Gemini models integrate well with Producer Pal through multiple
options. A free tier available with rate limits for trying out Producer Pal.

## Options

| Option                       | Best For   | Trade-offs                                                        |
| ---------------------------- | ---------- | ----------------------------------------------------------------- |
| [Built-in Chat UI](./gemini) | Most users | Native integration, easy setup. Free tier has strict rate limits. |
| [Gemini CLI](./gemini-cli)   | Developers | Terminal-based. Google AI subscription increases CLI limits.      |

## Recommendation

**Built-in Chat UI with Gemini** is the simplest path to try Producer Pal. Get a
[free API key](https://aistudio.google.com/apikey) to get started.

## Model Notes

- Gemini 3 Flash or Pro recommended
- Free tier: expect to hit rate limits during intensive sessions
- When you outgrow the free tier:
  - [OpenRouter](./chat-ui-other-providers#openrouter) with Gemini - simplest
    paid option
  - [Gemini CLI](./gemini-cli) with a Google AI subscription - higher limits
    without API billing setup
