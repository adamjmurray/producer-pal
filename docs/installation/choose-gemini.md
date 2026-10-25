# Using Gemini with Producer Pal

Google's Gemini models integrate well with Producer Pal through multiple
options. A free tier is available with rate limits for trying out Producer Pal.

## Options

| Option                       | Best For         | Trade-offs                                                        |
| ---------------------------- | ---------------- | ----------------------------------------------------------------- |
| [Built-in Chat UI](./gemini) | A free first try | Native integration, easy setup. Free tier has strict rate limits. |
| [Antigravity](./antigravity) | Desktop app fans | Google's agent app. MCP servers are added by editing a JSON file. |
| [Gemini CLI](./gemini-cli)   | Developers       | Terminal-based. Google AI subscription increases CLI limits.      |

Gemini CLI can also use the portable [Agent Skill](/guide/skills) instead of
MCP.

## Recommendation

**Built-in Chat UI with Gemini** works for a free first try. Get a
[free API key](https://aistudio.google.com/apikey) to get started — but expect
to hit the free tier's strict rate limits within moments during an active
session. For regular use, reach Gemini through an
[AI router](./chat-ui-other-providers#openrouter) instead.

## Model Notes

- Gemini 3.8 Flash or Gemini 4 Argon recommended
- Free tier: expect to hit rate limits quickly, even in short sessions
- When you outgrow the free tier:
  - [OpenRouter](./chat-ui-other-providers#openrouter) with Gemini - simplest
    paid option
  - [Antigravity](./antigravity) or [Gemini CLI](./gemini-cli) with a Google AI
    subscription - higher limits without API billing setup
