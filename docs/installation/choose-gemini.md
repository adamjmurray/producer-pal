# Using Gemini with Producer Pal

Google's Gemini models integrate well with Producer Pal through multiple
options.

## Options

| Option                               | Best For          | Trade-offs                                                        |
| ------------------------------------ | ----------------- | ----------------------------------------------------------------- |
| [Built-in Chat UI](./chat-ui#gemini) | A quick first try | Easy setup. Regular use needs billing or an AI router.            |
| [Antigravity](./antigravity)         | Desktop app fans  | Google's agent app. MCP servers are added by editing a JSON file. |
| [Gemini CLI](./gemini-cli)           | Developers        | Terminal-based. Google AI subscription increases CLI limits.      |

Gemini CLI can also use the portable [Agent Skill](/guide/skills) instead of
MCP.

## Recommendation

**Built-in Chat UI with Gemini** is the quickest way to try it. Get an
[API key](https://aistudio.google.com/apikey) to start. Any free use Google
offers won't last long in a real session, so for regular use reach Gemini
through an [AI router](./chat-ui#openrouter) instead.

## Model Notes

- Gemini 3.8 Flash or Gemini 4 Argon recommended
- For regular use:
  - [OpenRouter](./chat-ui#openrouter) with Gemini - simplest paid option
  - [Antigravity](./antigravity) or [Gemini CLI](./gemini-cli) with a Google AI
    subscription - higher limits without API billing setup
