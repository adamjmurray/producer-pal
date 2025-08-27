# Architecture

## System Overview

Producer Pal integrates with Ableton Live through a Max for Live device using
the Model Context Protocol (MCP) to enable AI assistants to manipulate music.

## Architecture Diagram

```
     +-----------------+
     | Anthropic Cloud |
     +-----------------+
             ↑
             | Anthropic API
             ↓
     +---------------+
     | Claude Desktop |
     +---------------+
             ↑
             | MCP stdio transport (via DXT)
             ↓
 +---------------------------+
 | Producer Pal Extension     |
 | (claude-ableton-connector) |
 +---------------------------+
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

## Component Details

### 1. Desktop Extension Bridge (`src/desktop-extension/claude-ableton-connector.js`)

Stdio-to-HTTP bridge that converts Claude Desktop's stdio transport to HTTP for
connecting to the MCP server. Provides graceful fallback when Producer Pal is
not running.

**Key features:**

- Zero runtime dependencies (all bundled)
- Graceful degradation when Live isn't running
- Returns helpful setup instructions when offline

### 2. MCP Server (`src/mcp-server/mcp-server.js`)

HTTP endpoint for MCP communication running in Node for Max. Entry point that
imports all tool definitions from `src/mcp-server/**`.

**Key details:**

- Runs on port 3350 by default
- Uses StreamableHTTP transport (SSE is deprecated)
- Bundles all dependencies (@modelcontextprotocol/sdk, express, zod)

### 3. Tool Implementations (`src/tools/**`)

Core logic for each operation. Each tool is a pure function that transforms
requests into Live API calls.

### 4. Live API Bridge (`src/mcp-server/mcp-server.js`)

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

Two separate JavaScript bundles built with rollup.js:

### MCP Server Bundle

- **Entry:** `src/mcp-server/mcp-server.js`
- **Output:** `device/mcp-server.mjs`
- **Target:** Node.js (Node for Max)
- **Dependencies:** Bundled for distribution

### V8 Bundle

- **Entry:** `src/live-api-adapter/live-api-adapter.js`
- **Output:** `device/live-api-adapter.js`
- **Target:** V8 engine (Max v8 object)
- **Dependencies:** None (uses Max built-ins)

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
`src/live-api-adapter/live-api-extensions.js`:

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

Semantic versioning (major.minor.patch) maintained in `src/shared/version.js`:

- Displayed in server startup logs
- Sent to MCP SDK as server version
- Output to Max for display in device UI

## Testing Infrastructure

- **Framework:** Vitest
- **Mock Live API:** `src/test/mock-live-api.js`
- **Test location:** Colocated with source (`*.test.js`)
- **Assertions:** Use `expect.objectContaining()` for maintainable tests
