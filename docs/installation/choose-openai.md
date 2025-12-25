# Using ChatGPT / OpenAI with Producer Pal

OpenAI's models work with Producer Pal through their web app or CLI tools. A
free tier is available with an OpenAI account, but has low usage limits. ChatGPT
Plus ($20/mo) or API credits is recommended for regular use.

## Options

| Option                                        | Best For               | Trade-offs                                    |
| --------------------------------------------- | ---------------------- | --------------------------------------------- |
| [ChatGPT Web](./chatgpt-web)                  | Existing ChatGPT users | Requires [web tunnel](./web-tunnels) setup.   |
| [Codex CLI](./codex-cli)                      | Developers             | Terminal-based, good for scripting workflows. |
| [Built-in Chat UI](./chat-ui-other-providers) | Direct API access      | Requires API key, pay-per-use pricing.        |

## Recommendation

**ChatGPT Web** if you already have ChatGPT Plus. **Built-in Chat UI** if you
prefer API pricing.

## Model Notes

- GPT-4o recommended for best results
- o1/o3 reasoning models not yet tested with Producer Pal
