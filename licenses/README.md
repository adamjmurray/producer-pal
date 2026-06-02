# Producer Pal Third Party Licenses

This folder contains the upstream license notices for third-party code bundled
with the Producer Pal runtime. Per the terms of the MIT / Apache 2.0 / ISC
licenses involved, these notices ship with every artifact that contains the
corresponding code.

Browse online:
[Producer Pal licenses folder](https://github.com/adamjmurray/producer-pal/tree/dev/licenses)

## What is bundled and where

The Max for Live device (`Producer_Pal.amxd`) is distributed alongside three
generated files in `max-for-live-device/`. Each bundles a different subset of
dependencies:

- **`mcp-server.mjs`** — the MCP server that runs inside Max. Bundles
  [`@modelcontextprotocol/sdk`](mcp-typescript-sdk-license),
  [`express`](express-license), and [`zod`](zod-license).
- **`chat-ui.html`** — the in-device chat UI (single-file Vite build). Bundles
  [`preact`](preact-license), [`marked`](marked-license),
  [`dompurify`](dompurify-license), [`idb`](idb-license),
  [Tailwind CSS](tailwindcss-license) (including `@tailwindcss/typography`), the
  [Vercel AI SDK](vercel-ai-sdk-license) (`ai`, `@ai-sdk/anthropic`,
  `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/openai`,
  `@ai-sdk/provider-utils`),
  [`@openrouter/ai-sdk-provider`](openrouter-ai-sdk-provider-license),
  [`@openai/agents`](openai-agents-license) (used for OpenAI voice mode),
  [`@google/genai`](google-genai-license) (used for Gemini voice mode),
  [CodeMirror 6](codemirror-license) (`@codemirror/state`, `@codemirror/view`,
  `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown`),
  and [`@lezer/highlight`](lezer-license) (transitive CodeMirror dep), plus a
  client subset of [`@modelcontextprotocol/sdk`](mcp-typescript-sdk-license).
- **`live-api-adapter.js`** — internal Producer Pal code only; no third-party
  runtime dependencies are bundled.

The Claude Desktop extension (`.mcpb`) bundles
[`@modelcontextprotocol/sdk`](mcp-typescript-sdk-license) and ships this entire
`licenses/` folder as-is. The npm distribution bundles the same and ships the
MCP SDK and Zod notices.
