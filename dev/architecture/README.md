# Architecture

## System Overview

Producer Pal integrates with Ableton Live through a Max for Live device using
the Model Context Protocol (MCP) to enable AI assistants to manipulate music.

Detail lives in these parts:

- [runtime-boundary.md](runtime-boundary.md) — V8 vs Node filesystem split, the
  embedded remote script, per-request headers, and subagent briefings.
- [build-system.md](build-system.md) — entry, output, and target for each of the
  four bundles.

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

### Voice Mode

The chat UI also has a realtime **voice mode**: speech-to-speech conversation
with the model, with the same MCP tools and conversation store as text chat. The
browser selects voice mode by choosing a realtime model; the provider is derived
from the model id (`gpt-realtime-2.1` → OpenAI, `gemini-3.1-flash-live-preview`
→ Gemini). Two backends are supported behind one interface:

- **OpenAI** uses the `@openai/agents` Realtime SDK over **WebRTC**. The SDK
  owns mic capture, voice-activity detection, and audio playback.
- **Gemini** uses the Gemini Live **WebSocket** with manual audio handling: 16
  kHz PCM captured via an AudioWorklet on the way up, 24 kHz PCM scheduled
  gaplessly on the way down.

The browser never holds the long-lived API key for the realtime connection. Two
Express routes on the MCP server mint/relay credentials server-side, both gated
to local origins:

- `POST /voice-token`
  ([routes/voice/voice-token-route.ts](../../src/mcp-server/routes/voice/voice-token-route.ts))
  forwards the user's OpenAI key to OpenAI's `client_secrets` endpoint
  server-to-server and returns only the short-lived `ek_...` ephemeral token.
- `POST /gemini-voice-token`
  ([routes/voice/gemini-voice-token-route.ts](../../src/mcp-server/routes/voice/gemini-voice-token-route.ts))
  currently returns the Gemini key as-is (`ephemeral: false`) — Gemini Live
  accepts the API key directly from the browser — with a server-only upgrade
  path to v1alpha ephemeral tokens (the client already honors the `ephemeral`
  flag).

The webui hook graph that drives all of this is documented in
[the Chat UI doc](../clients/chat-ui/voice-mode.md).

## Language Choices

The entire codebase uses TypeScript (`src/`, `scripts/`, and `webui/`).

**Benefits of TypeScript:**

- Static typing catches errors at compile time
- Complex React component state and props benefit from type safety
- Integrates the Vercel AI SDK with multiple provider packages
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
- Declares `tools.listChanged` and tells the client to re-list once the device
  comes online, so a cached offline tool list gets corrected. The stateless HTTP
  server can't send that itself — every `POST /mcp` is a fresh server — but the
  portal holds the stdio connection.

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

**Grammar:** `src/notation/barbeat/parser/barbeat-grammar.peggy`

## Module Layering

The `src/` tree is organized into layers with a one-directional dependency
graph. This is not just a convention: it is an **executable contract** enforced
in CI by `src/test/meta/import-restrictions.test.ts` (a violation fails
`npm test`). The layers, from foundational to top-level:

- **`shared/`** — foundational leaf. Pure utilities (path builders, config,
  pitch math, the `assertDefined` assertion helper, the V8 console shim)
  depended on by every other layer. It must not import from any higher layer.
- **`notation/`** — the bar|beat and transform DSL parsers/interpreters. A leaf:
  it may import only from `shared/`.
- **`tools/`** — the domain layer. Each tool is a pure function transforming a
  request into Live API calls. Imports `notation/` and `shared/`. It must
  **not** import from `mcp-server/` (the server composes tools, not the
  reverse).
- **`live-api-adapter/`** (V8 bundle entry) and **`mcp-server/`** (Node bundle
  entry) — composition layers that import `tools/` to expose them in their
  respective runtimes.
- **`portal/`** — standalone stdio-to-HTTP bridge; imports `mcp-server/` and
  `shared/`.

Enforced rules:

1. `shared/` has no upward dependencies (cannot import `tools/`, `mcp-server/`,
   `live-api-adapter/`, `notation/`, or `portal/`).
2. `notation/` is a leaf (may only import `shared/`).
3. `tools/` may not import `mcp-server/`.

**Documented exception:** `tools/session/library.ts` (and its batch helper)
import `mcp-server/live-library/library-types.ts`. That module is the shared
**ppal-library data contract** — types and limit-clamping consumed by both the
tool and its `mcp-server/live-library/` implementation. It has no upward
dependencies of its own, so the import is harmless; it is grandfathered via the
rule's `except` clause rather than relocated, keeping the live-library feature
cohesive.

The boundary rules apply to production source only. Test infrastructure —
everything the project classifies as a test file (see dev/quality/testing.md) —
legitimately reaches across layers and is excluded. It governs the shipped
dependency graph, which no test file is part of.

## Runtime Boundary

V8 holds the Live API and has no filesystem; Node for Max owns all filesystem
access. See [runtime-boundary.md](runtime-boundary.md).

## Build System

Four bundles: MCP server, V8, Portal, and Chat UI. See
[build-system.md](build-system.md).

## Message Protocol

Communication between Node.js and V8. Max caps a single symbol at ~32,767
characters, so the response JSON is split into chunks and terminated with
`END_OF_CHUNKS` — the receiver joins everything before it, and a missing
terminator is a loud wire-format error rather than a vague parse failure.

    ```js
    // Request from Node to V8
    ["mcp_request", requestId, tool, argsJSON, contextJSON]

    // Response from V8 to Node (errors are an isError result, same shape)
    ["mcp_response", requestId, chunk1, ..., chunkN, END_OF_CHUNKS]
    ```

The response object is an MCP `CallToolResult` plus two sidecars V8 sets and
Node strips before the SDK sees them: `errorCode` (a structured error category)
and `warnings` (the warnings that request raised, which `handleLiveApiResult`
collapses and appends as `WARNING:` content items).

`node_request` / `node_response`, the V8→Node RPC going the other way, uses the
same chunking and terminator.

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

Semantic versioning (major.minor.patch) maintained in `src/shared/config.ts`:

- Displayed in server startup logs
- Sent to MCP SDK as server version
- Output to Max for display in device UI

## Testing Infrastructure

- **Framework:** Vitest
- **Mock Live API:** `src/test/mocks/mock-live-api.ts` (mock `LiveAPI` class)
- **Mock registry:** `src/test/mocks/mock-registry.ts` (instance-level mocks per
  Live API object)
- **Test location:** Colocated with source (`*.test.ts`)
- **Assertions:** Use instance-level `RegisteredMockObject` mocks for per-object
  assertions (e.g., `expect(device.set).toHaveBeenCalledWith(...)`)
