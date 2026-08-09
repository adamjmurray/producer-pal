---
title: Ableton Live REST API
description:
  Producer Pal exposes a REST API for Ableton Live — control tracks, clips,
  devices, and arrangements over plain HTTP. No MCP SDK required.
head:
  - - meta
    - name: keywords
      content:
        Ableton REST API, Ableton Live REST API, Ableton HTTP API, Ableton Live
        API, Max for Live REST API, Ableton automation API
  - - meta
    - property: og:title
      content: Ableton Live REST API — Producer Pal
  - - meta
    - property: og:description
      content:
        Control Ableton Live over plain HTTP. Producer Pal's REST API lets you
        script tracks, clips, devices, and arrangements without an MCP SDK.
---

# Ableton Live REST API

Producer Pal includes a REST API for building custom scripts, automation, and
integrations with Ableton Live using plain HTTP requests — no MCP SDK needed. It
also works as an alternative interface for coding agents: download this page as
Markdown (button at the top) and give it to your agent for a complete reference.

The REST API runs on the same server as the MCP endpoint (default port 3350) and
is available whenever the Producer Pal Max for Live device is running.

::: info This is for developers

Most users don't need the REST API. The normal way to use Producer Pal is
through an AI chat client like Claude Desktop — see the
[Installation guide](/installation) to get started.

:::

## Endpoints

### List Tools

```
GET http://localhost:3350/api/tools
```

Returns all enabled tools with their JSON Schema input definitions:

```json
{
  "tools": [
    {
      "name": "ppal-read-live-set",
      "title": "Read Live Set",
      "description": "Read an overview of the Live Set...",
      "annotations": { "readOnlyHint": true, "destructiveHint": false },
      "inputSchema": { "type": "object", "properties": { ... } }
    }
  ]
}
```

### Call a Tool

```
POST http://localhost:3350/api/tools/{toolName}
Content-Type: application/json

{ "trackIndex": 0, "include": ["session-clips"] }
```

Returns (the default `json` format — see
[Response format](#response-format-format-json-default)):

```json
{ "result": { "...": "..." }, "isError": false }
```

- **200** with `isError: false` — tool ran successfully
- **200** with `isError: true` — tool ran but reported an error (e.g. invalid
  path, execution error)
- **404** — unknown or disabled tool
- **400** — invalid input (includes validation details)
- **504** — the tool didn't finish before the timeout (see
  [Per-request timeout](#per-request-timeout-timeoutms-n))
- **500** — internal server error

::: warning 504 and 500 use a different body shape

The error responses do **not** carry `result` / `isError`. A 504 returns
`{ "error": "...", "errorCode": "timeout" }` — check `errorCode` to distinguish
a timeout from other failures — and a 500 returns `{ "error": "..." }`. Client
code that reads `body.result` unconditionally will break on exactly the case the
`timeoutMs` parameter below invites you to hit.

:::

Warnings from the Live API surface as a separate `warnings` string array (or
inline in the `result` text under `?format=compact`). The `ppal-update-*` tools
use this when updating multiple objects — if any individual operation fails or
is inapplicable (e.g. setting quantize on an audio clip), it emits a warning and
continues with the rest.

### Response format: `?format=json` (default)

The REST API defaults to **`json`**: `result` is the parsed value (object,
array, number, string) and warnings are a separate `string[]`. This is the right
default for HTTP integrations — no `JSON.parse` or `jq | fromjson` gymnastics.
The device-level **JSON Output** setting (**Setup** tab) does not affect the
REST API.

The compact JS-literal format (unquoted keys, no whitespace) is optimized for
LLM token efficiency and is the same format MCP clients receive. It is opt-in
for REST via `?format=compact`, where `result` is a string with warnings inline:

```bash
# JSON (default) — result is the parsed value; warnings are a separate string array
curl -X POST http://localhost:3350/api/tools/ppal-read-live-set \
  -H 'Content-Type: application/json' -d '{}'
# → {"result":{"tempo":120,"timeSignature":"4/4",...},"isError":false}

# Compact JS-literal — result is a string, warnings are inline
curl -X POST 'http://localhost:3350/api/tools/ppal-read-live-set?format=compact' \
  -H 'Content-Type: application/json' -d '{}'
# → {"result":"{tempo:120,timeSignature:\"4/4\",...}","isError":false}
```

With the default `json` format (or explicit `?format=json`):

- **`result`** is the parsed value (object, array, number, string, etc.) — not a
  JSON-encoded string. Access fields directly: `body.result.tempo`.
- **`warnings`** is a `string[]` (with the `WARNING: ` prefix stripped), present
  only when the tool emitted any. In compact mode, warnings remain inline in
  `result` for backwards compatibility.
- **`appended`** is a `string[]` of extra Markdown text blocks the server
  attaches after the result. Currently only `ppal-connect` uses it, to deliver —
  in order — the Producer Pal skills (notation instructions), this Live Set's
  project context, your `~/.producer-pal/context.md` global context, your memory
  index, and a final next-step block. The context blocks are self-labeling
  (`Project context (this Live Set):`, `Global context (all projects):`,
  `Memory index — …`) and only appear when you've configured them; the skills
  and the next-step block are always present, so `appended` is never empty on
  `ppal-connect`. The next-step block names any empty context layers and tells
  the AI what to do next, so don't assume the last element is context. In
  compact mode these blocks are joined into the `result` string instead.
- On **error** (`isError: true`), `result` is still a plain error string
  regardless of format — error messages are not JSON.

Pass `?format=compact` to opt into the compact JS-literal format, or
`?format=json` to be explicit about the default. Other values return **400**.
The REST format is independent of the device-level setting and never affects MCP
clients.

### Per-request timeout: `?timeoutMs=N`

Override the configured tool-call timeout for a single request. Useful for
long-running operations (e.g. bulk clip generation) that need more headroom than
the global timeout, or for short polling calls that should fail fast.

```bash
curl -X POST 'http://localhost:3350/api/tools/ppal-create-clip?timeoutMs=10000' \
  -H 'Content-Type: application/json' \
  -d '{"slot": "0/0", "length": "16bar", "notes": "..."}'
```

`timeoutMs` must be a positive integer up to **60000** (60 seconds). Other
values return **400**. Combinable with `?format=`:

```
POST /api/tools/{name}?format=json&timeoutMs=10000
```

### Per-request toolset {#per-request-toolset}

Send `x-producer-pal-disabled-tools` — a comma-separated list of tool names — to
withhold tools from a single request. It works on both endpoints: a withheld
tool disappears from `GET /api/tools` and **404**s from
`POST /api/tools/{name}`.

The reason to bother is `ppal-connect`: withholding a tool also drops the part
of the [Skills](/features#skills) it returns that teaches that tool, so a client
that only needs a few tools stops paying for the rest in every session. See
[Choosing a Toolset](/features#toolset).

```bash
# A read-only session: no writers, and no note-writing instructions either
curl -X POST http://localhost:3350/api/tools/ppal-connect \
  -H 'Content-Type: application/json' \
  -H 'x-producer-pal-disabled-tools: ppal-create-clip,ppal-update-clip,ppal-delete' \
  -d '{}'
```

Send the same header on every request in the session — it applies per request,
not per client, and nothing is remembered between them. Unrecognized names are
ignored, and unlike `POST /config` this changes nothing on the device: the
[Chat UI](/guide/chat-ui) and other clients are unaffected.

`ppal-connect` itself can be withheld. Nothing is reserved here, unlike the
`npx producer-pal` flags.

::: tip Two more headers on the MCP endpoint

An MCP client connected straight to `http://localhost:3350/mcp` can send this
header plus two others, so it runs its own profile without a `POST /config`
changing everyone else's:

| Header                            | Value                           | Overrides                                      |
| --------------------------------- | ------------------------------- | ---------------------------------------------- |
| `x-producer-pal-disabled-tools`   | comma-separated tool names      | [the toolset](/features#toolset)               |
| `x-producer-pal-small-model-mode` | `true` / `false`                | [small model mode](/features#small-model-mode) |
| `x-producer-pal-notation`         | `barbeat`, `midi-json`, `stark` | [the notation](/features/midi-notation)        |

Absent or unrecognized values fall back to the device's global setting, so
clients that send nothing are unaffected. The REST endpoints above honor only
the toolset header — notation and small model mode come from the device there.

:::

## Quick Start with curl

```bash
# Read the Live Set overview
curl -X POST http://localhost:3350/api/tools/ppal-read-live-set \
  -H 'Content-Type: application/json' -d '{}'

# Read track 0 with all clips
curl -X POST http://localhost:3350/api/tools/ppal-read-track \
  -H 'Content-Type: application/json' \
  -d '{"trackIndex": 0, "include": ["session-clips", "arrangement-clips"]}'

# List available tools
curl http://localhost:3350/api/tools
```

## Sample Scripts

Zero-dependency client examples — they use only built-in HTTP libraries. Copy
and modify them for your own integrations.

### Node.js

The Node.js client doubles as the Producer Pal [Agent Skill](/guide/skills)
script — see [The bundled script](/guide/skills#the-bundled-script) for the full
source and CLI reference. It works with Claude Code, Codex CLI, Gemini CLI, and
any other agent runtime that reads the `SKILL.md` convention.

- Source:
  [`examples/skills/producer-pal/ppal.mjs`](https://github.com/adamjmurray/producer-pal/tree/main/examples/skills/producer-pal/ppal.mjs)
- Requires Node.js 18+ (for built-in `fetch`)

### Python

Works with Python 3.6+ (no dependencies).

<<< ../../examples/rest-api/ppal.py

## Tool Reference

Use the [list tools endpoint](#list-tools) to discover all available tools and
their input schemas at runtime. You can also browse the full tool documentation
on the [Features](/features) page.

## Live API

The `ppal-live-api` tool provides direct access to the
[Ableton Live Object Model](https://docs.cycling74.com/apiref/lom/) for
scripting and debugging.

It is opt-in: enable **Direct Live API** on the **Setup** tab of the Producer
Pal Max for Live device, or programmatically with a `POST /config` request (from
curl or a same-origin script — cross-origin browser writes to `/config` are
rejected):

```bash
curl -X POST http://localhost:3350/config \
  -H 'Content-Type: application/json' \
  -d '{"liveApiEnabled": true}'
```

The setting is global to the device (it also affects the Chat UI and any
connected MCP clients). This is an advanced escape hatch — the higher-level
tools are tuned for reliable results, so reach for the raw Live API only for
custom integrations, scripting, or debugging when the standard tools aren't
enough.

### Request structure

The `path` parameter sets the initial Live Object Model object to operate on
(e.g., `"live_set"`, `"live_set tracks 0"`,
`"live_set tracks 0 clip_slots 1 clip"`). The `operations` array is then
executed sequentially on that object. Use `goto` to navigate to a different
object mid-sequence.

Available operation types:

| Type                   | Properties used             | Description                                                                                                                             |
| ---------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `get_property` / `get` | `property`                  | Read a property's raw value — a `_list` property returns the full array                                                                 |
| `set_property` / `set` | `property`, `value`         | Write a property value                                                                                                                  |
| `call_method` / `call` | `method`, `args` (optional) | Call a method                                                                                                                           |
| `goto`                 | `value` (path)              | Navigate to a different object                                                                                                          |
| `info`                 | —                           | Get object info                                                                                                                         |
| `getProperty`          | `property`                  | Read a property, unwrapped to a scalar — truncates a `_list` property to its first element; use `get`/`get_property` for the full array |
| `getChildIds`          | `property` (child type)     | Get child object IDs                                                                                                                    |
| `exists`               | —                           | Check if the object exists                                                                                                              |
| `getColor`             | —                           | Read object color                                                                                                                       |
| `setColor`             | `value` (hex string)        | Write object color                                                                                                                      |

### Examples

```bash
# Get the tempo
curl -X POST http://localhost:3350/api/tools/ppal-live-api \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "live_set",
    "operations": [{"type": "get_property", "property": "tempo"}]
  }'

# Set the tempo to 140 BPM
curl -X POST http://localhost:3350/api/tools/ppal-live-api \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "live_set",
    "operations": [{"type": "set_property", "property": "tempo", "value": 140}]
  }'

# Fire scene 0
curl -X POST http://localhost:3350/api/tools/ppal-live-api \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "live_set",
    "operations": [{"type": "call", "method": "fire_scene_at_index", "args": [0]}]
  }'

# Chain multiple operations on one object
curl -X POST http://localhost:3350/api/tools/ppal-live-api \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "live_set tracks 0",
    "operations": [
      {"type": "get", "property": "name"},
      {"type": "get", "property": "color_index"},
      {"type": "get", "property": "has_midi_input"}
    ]
  }'
```

::: info

When the **Direct Live API** toggle is off on the device Setup tab, requests to
`ppal-live-api` return 404.

:::

## Tips

- The `inputSchema` in the tool list response is standard
  [JSON Schema](https://json-schema.org/), so you can use it for client-side
  validation or code generation.
- The REST API shares the same tool configuration as MCP — tools enabled or
  disabled on the device apply to both interfaces.
- The REST API has no authentication (same as the MCP endpoint). It is designed
  for use on localhost or trusted networks only.
- Browser pages can only call the REST API from localhost origins by default
  (`ENABLE_REMOTE_CORS` widens this to any origin). curl and other non-browser
  clients ignore CORS entirely and are unaffected either way.
