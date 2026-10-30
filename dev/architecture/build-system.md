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
- **Remote script:** the `embedRemoteScript()` rolldown plugin
  (`config/rolldown-plugin-embed-remote-script.mjs`) inlines `remote-script/`'s
  Python files, so the device can install them. See
  [runtime-boundary.md](runtime-boundary.md#the-embedded-remote-script)
- **Plug-in host wrappers:** `embedPluginHost()`
  (`config/rolldown-plugin-embed-plugin-host.mjs`) inlines the two wrapper
  `.amxd` files, only with `ENABLE_HOSTED_PLUGINS=true`.

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
- **Remote script and plug-in host wrappers:** embedded the same way, so the
  portal can install them while the device is offline
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
- **Plug-in host wrappers:** `config/vite.config.ts` inlines
  `process.env.ENABLE_HOSTED_PLUGINS`, so the Installation tab's wrapper UI
  (`webui/src/hooks/settings/installation/helpers/plugin-host-wrappers.ts`)
  exists only in a hosting build. `CHAT_UI_OUT_DIR` moves the output (the
  build-contents test uses it); the UI is also inlined in the device bundle, so
  the rolldown plugin treats a UI built with another flag value as stale.
- **Purpose:** Preact-based chat interface with multi-provider AI + MCP
  integration
- **Features:**
  - Served from MCP server's Express app
  - Opened in system default browser (avoids Max jweb keyboard issues)
  - Uses Vercel AI SDK (`streamText()`) for all providers (Anthropic, Google,
    OpenAI, Mistral, OpenRouter, Vercel AI Gateway, Ollama)
  - Real-time streaming chat interface with automatic MCP tool calling
  - Settings persistence via localStorage

See `dev/clients/chat-ui/README.md` for detailed architecture and development
workflow.
