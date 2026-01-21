# Architecture

## System Overview

Producer Pal integrates with Ableton Live through a Max for Live device using
the Model Context Protocol (MCP) to enable AI assistants to manipulate music.

## Architecture Diagrams

### MCP Host with stdio Transport

This shows how MCP hosts like Claude Desktop or LM Studio connect via the
Producer Pal Portal (stdio-to-HTTP adapter). It's also possible to run LLMs
locally with no online dependencies.

```
  +-----------------------+
  | LLM Cloud / Local LLM |
  +-----------------------+
             ↑
             | LLM API (streaming)
             ↓
     +----------------+
     | MCP Host (e.g. |
     | Claude Desktop)|
     +----------------+
             ↑
             | MCP stdio transport (via Claude Desktop extension)
             ↓
  +-------------------------+
  |   Producer Pal Portal   |
  | (stdio-to-http adapter) |
  +-------------------------+
             ↑
             | MCP streamable HTTP transport
             ↓
+-----------------------------+
|        Ableton Live         |
|  +-----------------------+  |
|  |  Max for Live Device  |  |
|  |  +---------------+    |  |
|  |  | Node for Max  |    |  |
|  |  | (MCP Server)  |    |  |
|  |  +---------------+    |  |
|  |         ↑             |  |
|  |         | Max message |  |
|  |         ↓             |  |
|  |  +---------------+    |  |
|  |  |      v8       |    |  |
|  |  |  (Live API)   |    |  |
|  |  +---------------+    |  |
|  +-----------------------+  |
+-----------------------------+
```

### Built-in Chat UI

This shows how things work with the built-in chat UI. The browser loads the chat
UI from the MCP server's Express app and connects directly to the LLM API.

```
 +-----------------------+
 | LLM Cloud / Local LLM |
 +-----------------------+
             ↑
             | LLM API (streaming)
             ↓
     +---------------+
     |    Browser    |
     |   (Chat UI)   |
     +---------------+
         ↑       ↑
         |       | MCP streamable HTTP transport
         |       ↓
         |   +-----------------------------+
   serves|   |        Ableton Live         |
   HTML  |   |  +-----------------------+  |
         |   |  |  Max for Live Device  |  |
         |   |  |  +---------------+    |  |
         +---|--|--| Node for Max  |    |  |
             |  |  | (MCP Server + |    |  |
             |  |  |  Express app) |    |  |
             |  |  +---------------+    |  |
             |  |         ↑             |  |
             |  |         | Max message |  |
             |  |         ↓             |  |
             |  |  +---------------+    |  |
             |  |  |      v8       |    |  |
             |  |  |  (Live API)   |    |  |
             |  |  +---------------+    |  |
             |  +-----------------------+  |
             +-----------------------------+
```

## Language Choices

The entire codebase uses TypeScript (`src/`, `scripts/`, and `webui/`).

**Benefits of TypeScript:**

- Static typing catches errors at compile time
- Complex React component state and props benefit from type safety
- Integrates multiple AI SDKs (Google GenAI, OpenAI) with different APIs
- Complex response mapping to normalized UI format requires type safety
- Streaming protocols and message parsing have many edge cases

**Runtime validation:**

- Zod schemas validate tool inputs to avoid unexpected runtime values
- Live API has no type definitions (uses type assertions where needed)

## Component Details

### 1. Producer Pal Portal (`src/portal/producer-pal-portal.ts`)

Stdio-to-HTTP bridge that converts MCP stdio transport to HTTP for connecting to
the MCP server. Provides graceful fallback when Producer Pal is not running.

**Key features:**

- Zero runtime dependencies (all bundled)
- Graceful degradation when Live isn't running
- Returns helpful setup instructions when offline

### 2. MCP Server (`src/mcp-server/mcp-server.ts`)

HTTP endpoint for MCP communication running in Node for Max. Entry point that
imports all tool definitions from `src/tools/**/*.def.ts`.

**Key details:**

- Runs on port 3350 by default
- Uses StreamableHTTP transport (SSE is deprecated)
- Bundles all dependencies (@modelcontextprotocol/sdk, express, zod)

### 3. Tool Implementations (`src/tools/**`)

Core logic for each operation. Each tool is a pure function that transforms
requests into Live API calls.

### 4. Live API Adapter (`src/live-api-adapter/live-api-adapter.ts`)

V8 JavaScript that receives messages from Node.js and calls Live API. Entry
point for the V8 Max object.

**Key responsibilities:**

- Receives serialized JSON from Node.js
- Makes Live API calls
- Returns results to Node.js

### 5. bar|beat Notation (`src/notation/barbeat/*`)

Musical notation parser and utilities for creating and manipulating MIDI clips.

**Grammar:** `src/notation/barbeat/barbeat-grammar.peggy`

## Build System

Four separate bundles built with rollup.js (MCP server, V8, Portal) and Vite
(Chat UI):

### MCP Server Bundle

- **Entry:** `src/mcp-server/mcp-server.ts`
- **Output:** `max-for-live-device/mcp-server.mjs`
- **Target:** Node.js (Node for Max)
- **Dependencies:** Bundled for distribution

### V8 Bundle

- **Entry:** `src/live-api-adapter/live-api-adapter.ts`
- **Output:** `max-for-live-device/live-api-adapter.js`
- **Target:** V8 engine (Max v8 object)
- **Dependencies:** None (uses Max built-ins)

### Portal Bundle

- **Entry:** `src/portal/producer-pal-portal.ts`
- **Output:** `release/producer-pal-portal.js`
- **Target:** Node.js (standalone process)
- **Dependencies:** Bundled for distribution (zero runtime dependencies)
- **Purpose:** stdio-to-HTTP adapter for Claude Desktop Extension
- **Features:**
  - Converts MCP stdio transport to streamable HTTP
  - Graceful degradation when Live isn't running
  - Returns setup instructions when offline

### Chat UI Bundle

- **Entry:** `webui/src/main.tsx`
- **Output:** `max-for-live-device/chat-ui.html`
- **Target:** Browser (served at `http://localhost:3350/chat`, opened via Max)
- **Build Tool:** Vite with custom plugins
- **Dependencies:** Bundled into single self-contained HTML file
- **Purpose:** Preact-based chat interface for Gemini + MCP integration
- **Features:**
  - Served from MCP server's Express app
  - Opened in system default browser (avoids Max jweb keyboard issues)
  - Connects to Gemini API with automatic MCP tool calling
  - Real-time streaming chat interface
  - Settings persistence via localStorage

See `dev-docs/Chat-UI.md` for detailed architecture and development workflow.

## Message Protocol

Communication between Node.js and V8:

```javascript
// Request from Node to V8
["mcp_request", JSON.stringify({ requestId, tool, args })][
  // Response from V8 to Node
  ("mcp_response", JSON.stringify({ requestId, result }))
][
  // Error from V8 to Node
  ("mcp_response", JSON.stringify({ requestId, error }))
];
```

## Live API Interface

The Live API has idiosyncrasies that are abstracted by
`src/live-api-adapter/live-api-extensions.ts`:

- Properties accessed via `.get("propertyName")?.[0]`
- Color values need special conversion
- Some properties require different access patterns

## Critical API Features

### drumMap Preservation

The `drumMap` property in track objects is a critical user-facing feature that
enables drum programming workflows. Any changes to device structure must
preserve drumMap functionality by ensuring extraction logic can locate drum rack
devices across all device categories.

### Playback State Handling

Due to Live API timing, playback-related operations return optimistic results
assuming success rather than immediately reading state which may not reflect
changes yet.

## Versioning

Semantic versioning (major.minor.patch) maintained in `src/shared/version.ts`:

- Displayed in server startup logs
- Sent to MCP SDK as server version
- Output to Max for display in device UI

## Testing Infrastructure

- **Framework:** Vitest
- **Mock Live API:** `src/test/mock-live-api.ts`
- **Test location:** Colocated with source (`*.test.ts`)
- **Assertions:** Use `expect.objectContaining()` for maintainable tests
