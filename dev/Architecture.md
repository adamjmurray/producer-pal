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

### Voice Mode

The chat UI also has a realtime **voice mode**: speech-to-speech conversation
with the model, with the same MCP tools and conversation store as text chat. The
browser selects voice mode by choosing a realtime model; the provider is derived
from the model id (`gpt-realtime-2` → OpenAI, `gemini-3.1-flash-live-preview` →
Gemini). Two backends are supported behind one interface:

- **OpenAI** uses the `@openai/agents` Realtime SDK over **WebRTC**. The SDK
  owns mic capture, voice-activity detection, and audio playback.
- **Gemini** uses the Gemini Live **WebSocket** with manual audio handling: 16
  kHz PCM captured via an AudioWorklet on the way up, 24 kHz PCM scheduled
  gaplessly on the way down.

The browser never holds the long-lived API key for the realtime connection. Two
Express routes on the MCP server mint/relay credentials server-side, both gated
to local origins:

- `POST /voice-token`
  ([routes/voice-token-route.ts](../src/mcp-server/routes/voice-token-route.ts))
  forwards the user's OpenAI key to OpenAI's `client_secrets` endpoint
  server-to-server and returns only the short-lived `ek_...` ephemeral token.
- `POST /gemini-voice-token`
  ([routes/gemini-voice-token-route.ts](../src/mcp-server/routes/gemini-voice-token-route.ts))
  currently returns the Gemini key as-is (`ephemeral: false`) — Gemini Live
  accepts the API key directly from the browser — with a server-only upgrade
  path to v1alpha ephemeral tokens (the client already honors the `ephemeral`
  flag).

The webui hook graph that drives all of this is documented in
[Chat-UI.md](./Chat-UI.md#voice-mode).

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
everything the project classifies as a test file (AGENTS.md → Test File
Classification) — legitimately reaches across layers and is excluded. It governs
the shipped dependency graph, which no test file is part of.

## Runtime Boundary: Filesystem & User-Content Features

Two runtimes cooperate to serve every request. **V8** (the Max `v8` object,
`src/live-api-adapter/`) holds the Live API and has **no filesystem**. **Node
for Max** (`src/mcp-server/`) runs the Express/MCP service and **owns all
filesystem access** (`node:fs`). Shipped `src/**` also cannot shell out — the
lint config bans `child_process`.

The consequence for user-content and config features (global context, custom
system prompt, `~/.producer-pal` skills overrides): **all filesystem reads and
writes are handled Node-side, and these features do not touch the Live API.**
From the outside it is one MCP/REST service — it does not matter which runtime
services which part of a request. So content that must reach an external MCP
client is **injected into the `ppal-connect` result Node-side** (the same append
seam the `WARNING:` relay uses; see
`helpers/global-context/global-context-inject.ts`), rather than built in a V8
tool handler that has no way to read the files. The webui, which also has no
filesystem, round-trips through Node REST routes (`config-markdown-route.ts` and
friends) for the same reason.

This is why the built-in skills blob — historically assembled in the V8
`connect()` handler — is assembled **Node-side** once overrides enter the
picture: the override files are only readable from Node, so `buildSkills` runs
where the filesystem lives and the result is injected into `ppal-connect`.

### Per-request assembly

`POST /mcp` builds a fresh `createMcpServer` per request, so three settings can
vary per caller rather than per device. Each rides an HTTP header, and each
falls back to the global config when absent, so external MCP clients are
unaffected:

- `SMALL_MODEL_MODE_HEADER` (`src/shared/config.ts`) — shrinks tool schemas and
  selects the `basic` skills driver.
- `DISABLED_TOOLS_HEADER` (`src/shared/config.ts`) — a comma-separated
  **subtraction** from `config.tools`. It withholds those tools from
  registration _and_ drops the skills fragments that teach them
  (`src/skills/fragment-tool-gates.ts`), so a caller never pays for guidance
  about a tool it can't call.
- `NOTATION_HEADER` (`src/shared/notation.ts`, next to the `isNotation` guard it
  validates against — `config.ts` stays import-free because the webui compiles
  it under a tsconfig that rejects `.ts` import paths) — selects the notation
  variant of the skills and the notation-keyed param descriptions.

The subtraction shape is what the webui can actually send: its `enabledTools` is
a sparse map (absent = enabled), and the header must be set when the transport
is built — before `listTools` could reveal the catalog a whitelist would need.
Together these are what lets one server serve a full-strength orchestrator and
several narrowly-scoped subagent workers concurrently.

Notation is the one axis that crosses the runtime boundary. The other two are
settled entirely Node-side, but notation also decides how V8 parses and formats
clip notes (`ToolContext.notation`), and V8 holds it as a session global with no
per-request setter. So `withNotationOverride`
(`src/mcp-server/helpers/request-overrides/`) wraps `callLiveApi` and puts the
resolved value in the same `RequestOverrides` blob as
`timeoutMs`/`compactOutput` — V8's `buildRequestContext` spreads it onto the
per-request `ToolContext`. That keeps the notation a caller is _taught_
identical to the one it is _answered in_; without it a stark worker would hand
stark note strings to a bar|beat parser.

### Subagent briefings

A spawned subagent worker does not call `ppal-connect`. `GET /subagent-briefing`
(`src/mcp-server/routes/subagent-briefing-route.ts`) assembles what that call
would have taught it — the Live Set overview, the skills its toolset needs, and
the project/global context blocks — and the webui appends the result to the
worker's **system instruction** at spawn
(`webui/src/chat/sdk/subagent/subagent-briefing.ts`).

The endpoint reads the caller's profile off the **same three headers** above, so
a briefing describes exactly the toolset and notation the worker's own tool
calls will run under; one builder (`perRequestHeaders`) emits them for both.

Two things move the blob out of message history and into the system prompt:

- **Cost.** A worker is a fresh conversation with no history to amortize a
  cached blob against, so the connect result is written at full price every
  spawn — plus an entire inference round spent making the call. The system
  prompt is the only part of a worker's request that repeats byte-for-byte
  across spawns of the same profile, which is what makes a cache hit possible at
  all.
- **Framing.** The connect response ends with a next step written for someone
  talking to a user ("report the connection status … then wait for their
  instructions"). A briefing replaces it with the subagent framing, and drops
  the memory index (a briefed worker has no `ppal-context` to load a body with)
  and the `"conversation-only"` skills fragments — the **audience** axis in
  `src/skills/fragment-tool-gates.ts`, which exists for guidance no toolset
  could ever have decided was unnecessary.

Every failure path — server down, Live unreachable (the route answers 502),
malformed body — resolves to no briefing, and the worker keeps `ppal-connect`
and bootstraps itself the old way. A worker with neither is blind.

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
- **Output:** `claude-desktop-extension/producer-pal-portal.js` and
  `npm/producer-pal-portal.js`
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
- **Purpose:** Preact-based chat interface with multi-provider AI + MCP
  integration
- **Features:**
  - Served from MCP server's Express app
  - Opened in system default browser (avoids Max jweb keyboard issues)
  - Uses Vercel AI SDK (`streamText()`) for all providers (Anthropic, Google,
    OpenAI, Mistral, OpenRouter, Ollama)
  - Real-time streaming chat interface with automatic MCP tool calling
  - Settings persistence via localStorage

See `dev/Chat-UI.md` for detailed architecture and development workflow.

## Message Protocol

Communication between Node.js and V8:

    ```js
    // Request from Node to V8
    ["mcp_request", JSON.stringify({ requestId, tool, args })]

    // Response from V8 to Node
    ["mcp_response", JSON.stringify({ requestId, result })]

    // Error from V8 to Node
    ["mcp_response", JSON.stringify({ requestId, error })]
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
