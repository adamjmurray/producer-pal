# Using Mistral with Producer Pal

Mistral AI models work with Producer Pal through the built-in Chat UI, the
Mistral Vibe desktop app, Mistral Vibe CLI, or Le Chat (web).

## Options

| Option                                 | Best For         | Trade-offs                                                                 |
| -------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| [Built-in Chat UI](./api-keys#mistral) | Most users       | Requires API key, native integration.                                      |
| [Mistral Vibe](./mistral-vibe)         | Desktop app fans | Code tab only. MCP servers are added by editing a config file.             |
| [Mistral Vibe CLI](./mistral-vibe-cli) | Developers       | Terminal-based, open-source CLI agent.                                     |
| [Le Chat](./mistral-le-chat)           | Browser only     | Not recommended: needs a public [web tunnel](./remote-access#web-tunnels). |

## Recommendation

**Built-in Chat UI** with a Mistral API key is the easiest. **Mistral Vibe**
suits anyone with a Mistral subscription who wants a desktop app, and **Mistral
Vibe CLI** is better for developers who prefer a terminal workflow. **Le Chat**
works too, but needs a web tunnel, which puts Live on the public internet.
