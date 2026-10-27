# Architecture

## System Overview

Producer Pal integrates with Ableton Live through a Max for Live device using
the Model Context Protocol (MCP) to enable AI assistants to manipulate music.

Detail lives in these parts:

- [runtime-boundary.md](runtime-boundary.md) — V8 vs Node filesystem split, the
  embedded remote script, per-request headers, and subagent briefings.
- [user-content-overrides.md](user-content-overrides.md) — what
  `~/.producer-pal` holds, and the rules for override slots.
- [install-paths.md](install-paths.md) — the two ways a new user is set up (the
  AI does it, or device first) and which code answers each step.
- [remote-script.md](remote-script.md) — how a tool reaches the Python remote
  script in Live: call path, contract files, adding a route, availability.
- [write-queue.md](write-queue.md) — why write calls run one at a time, and how
  the queue treats timeouts and disconnects.
- [skills.md](skills.md) — how the Skills text is cut into fragments, gated by
  tool, and split into read and write halves.
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

The chat UI also has a realtime voice mode (OpenAI over WebRTC, Gemini Live over
WebSocket). Two Express routes on the MCP server mint credentials so the browser
never holds the long-lived key. See
[voice-mode.md](../clients/chat-ui/voice-mode.md).

## Language Choices

TypeScript everywhere (`src/`, `scripts/`, `evals/`, `webui/`, `config/`,
`e2e/`) except the Python remote script. Zod validates tool inputs. The Live API
has no type definitions, so code uses type assertions where needed. The chat UI
is Preact.

## Component Details

### 1. Producer Pal Portal (`src/portal/producer-pal-portal.ts`)

Stdio-to-HTTP bridge that converts MCP stdio transport to HTTP for connecting to
the MCP server. Provides graceful fallback when Producer Pal is not running.

**Key features:**

- Zero runtime dependencies (all bundled)
- Graceful degradation when Live isn't running
- Answers calls itself when the device is offline (`src/portal/offline/`): it
  pings the remote script to say whether Live is up without Producer Pal, and
  runs `ppal-manage` `install-producer-pal` and `add-producer-pal`. See
  [ppal-manage](../specs/tool-behavior/ppal-manage.md#while-producer-pal-isnt-running).
- Updates the running device in place (`src/portal/update/`): the bridge answers
  `ppal-manage` `update-producer-pal` itself, online or off, since the device it
  replaces dies with the swap, and adds an update hint to `ppal-connect` when
  the device is older than the portal. See
  [ppal-manage](../specs/tool-behavior/ppal-manage.md#update-producer-pal).
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

**The device patch** (`max-for-live-device/*.maxpat`): any change to a device
setting is an undo step in Live ("Change in Producer_Pal"), and undoing it
re-sends the setting's value. Anything in the patch that acts when a setting
fires must ignore the same value re-sent: the Port box stops the server when it
fires, so a `change` object lets only a real port change through.

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

`node_request` / `node_response` is the V8→Node RPC going the other way. Its
`node_response` uses the same chunking and terminator, but a `node_request` goes
as one message: V8 refuses one too large to send rather than let Max cut it
short.

### Write calls run one at a time

Node sends write calls to V8 one at a time, across all clients; reads skip the
queue. See [write-queue.md](write-queue.md).

## Live API Interface

The Live API has idiosyncrasies that are abstracted by
`src/live-api-adapter/live-api-extensions.ts`. Use it; never read properties
with raw `.get("propertyName")?.[0]`. Examples of what it hides:

- Color values need special conversion
- Some properties require different access patterns

## Critical API Features

### drumMap Preservation

The `drumMap` property in track objects is a critical user-facing feature that
enables drum programming workflows. Any changes to device structure must
preserve drumMap functionality by ensuring extraction logic can locate drum rack
devices across all device categories.

## Versioning

Semantic versioning (major.minor.patch) maintained in `src/shared/config.ts`:

- Displayed in server startup logs
- Sent to MCP SDK as server version
- Output to Max for display in device UI

## Testing Infrastructure

Vitest, with tests colocated with source (`*.test.ts`). The mock LiveAPI is
`src/test/mocks/mock-live-api.ts`; see [testing.md](../quality/testing.md) for
the mock registry and the rest.
