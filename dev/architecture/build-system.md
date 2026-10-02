# Build System

The four bundles and where each one ships. Part of the [Architecture](README.md)
docs.

Four separate bundles built with rolldown (MCP server, V8, Portal) and Vite
(Chat UI):

## MCP Server Bundle

- **Entry:** `src/mcp-server/mcp-server.ts`
- **Output:** `max-for-live-device/mcp-server.mjs`
- **Target:** Node.js (Node for Max)
- **Dependencies:** Bundled for distribution

## V8 Bundle

- **Entry:** `src/live-api-adapter/live-api-adapter.ts`
- **Output:** `max-for-live-device/live-api-adapter.js`
- **Target:** V8 engine (Max v8 object)
- **Dependencies:** None (uses Max built-ins)

## Portal Bundle

- **Entry:** `src/portal/producer-pal-portal.ts`
- **Output:** `claude-desktop-extension/producer-pal-portal.js` and
  `npm/producer-pal-portal.js`
- **Target:** Node.js (standalone process)
- **Dependencies:** Bundled for distribution (zero runtime dependencies)
- **Purpose:** stdio-to-HTTP adapter for Claude Desktop Extension
- **Features:**
  - Converts MCP stdio transport to streamable HTTP
  - Graceful degradation when Live isn't running
  - Returns setup instructions when offline

## Chat UI Bundle

- **Entry:** `webui/src/main.tsx`
- **Output:** `max-for-live-device/chat-ui.html`
- **Target:** Browser (served at `http://localhost:3350/chat`, opened via Max)
- **Build Tool:** Vite with custom plugins
- **Dependencies:** Bundled into single self-contained HTML file
- **Purpose:** Preact-based chat interface with multi-provider AI + MCP
  integration
- **Features:**
  - Served from MCP server's Express app
  - Opened in system default browser (avoids Max jweb keyboard issues)
  - Uses Vercel AI SDK (`streamText()`) for all providers (Anthropic, Google,
    OpenAI, Mistral, OpenRouter, Ollama)
  - Real-time streaming chat interface with automatic MCP tool calling
  - Settings persistence via localStorage

See `dev/clients/chat-ui/README.md` for detailed architecture and development
workflow.
