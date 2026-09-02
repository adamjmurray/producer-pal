---
title: Ableton Live REST API
description:
  Producer Pal exposes a REST API for Ableton Live. Control tracks, clips,
  devices, and arrangements over plain HTTP. No MCP SDK required.
head:
  - - meta
    - name: keywords
      content:
        Ableton REST API, Ableton Live REST API, Ableton HTTP API, Ableton Live
        API, Max for Live REST API, Ableton automation API
  - - meta
    - property: og:title
      content: "Ableton Live REST API: Producer Pal"
  - - meta
    - property: og:description
      content:
        Control Ableton Live over plain HTTP. Producer Pal's REST API lets you
        script tracks, clips, devices, and arrangements without an MCP SDK.
---

# Ableton Live REST API

Producer Pal includes a REST API for building custom scripts, automation, and
integrations with Ableton Live using plain HTTP requests, no MCP SDK needed. It
also works as an alternative interface for coding agents: download this page as
Markdown (button at the top) and give it to your agent for a complete reference.

The REST API runs on the same server as the MCP endpoint (default port 3350) and
is available whenever the Producer Pal Max for Live device is running.

::: info This is for developers

Most users don't need the REST API. The normal way to use Producer Pal is
through an AI chat client like Claude Desktop. See the
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

{ "path": "t0", "include": ["session-clips"] }
```

Returns (the default `json` format, see
[Response format](#response-format-format-json-default)):

```json
{ "result": { "...": "..." }, "isError": false }
```

- **200** with `isError: false`: tool ran successfully
- **200** with `isError: true`: tool ran but reported an error (e.g. invalid
  path, execution error)
- **404**: unknown or disabled tool
- **400**: invalid input (includes validation details)
- **504**: the tool didn't finish before the timeout (see
  [Per-request timeout](#per-request-timeout-timeoutms-n))
- **500**: internal server error

::: warning 504 and 500 use a different body shape

The error responses do **not** carry `result` / `isError`. A 504 returns
`{ "error": "...", "errorCode": "timeout" }` (check `errorCode` to distinguish a
timeout from other failures), and a 500 returns `{ "error": "..." }`. Client
code that reads `body.result` unconditionally will break on exactly the case the
`timeoutMs` parameter below invites you to hit.

:::

Warnings from the Live API surface as a separate `warnings` string array (or
inline in the `result` text under `?format=compact`). The `ppal-update-*` tools
use this when updating multiple objects: if any individual operation fails or is
inapplicable (e.g. setting quantize on an audio clip), it emits a warning and
continues with the rest.

### Response format: `?format=json` (default)

The REST API defaults to **`json`**: `result` is the parsed value (object,
array, number, string) and warnings are a separate `string[]`. This is the right
default for HTTP integrations, with no `JSON.parse` or `jq | fromjson`
gymnastics. The device-level **JSON Output** setting (**Setup** tab) does not
affect the REST API.

The compact JS-literal format (unquoted keys, no whitespace) is optimized for
LLM token efficiency and is the same format MCP clients receive. It is opt-in
for REST via `?format=compact`, where `result` is a string with warnings inline:

```bash
# JSON (default): result is the parsed value; warnings are a separate string array
curl -X POST http://localhost:3350/api/tools/ppal-read-live-set \
  -H 'Content-Type: application/json' -d '{}'
# → {"result":{"tempo":120,"timeSignature":"4/4",...},"isError":false}

# Compact JS-literal: result is a string, warnings are inline
curl -X POST 'http://localhost:3350/api/tools/ppal-read-live-set?format=compact' \
  -H 'Content-Type: application/json' -d '{}'
# → {"result":"{tempo:120,timeSignature:\"4/4\",...}","isError":false}
```

With the default `json` format (or explicit `?format=json`):

- **`result`** is the parsed value (object, array, number, string, etc.), not a
  JSON-encoded string. Access fields directly: `body.result.tempo`.
- **`warnings`** is a `string[]` (with the `WARNING: ` prefix stripped), present
  only when the tool emitted any. In compact mode, warnings remain inline in
  `result` for backwards compatibility.
- **`appended`** is a `string[]` of extra Markdown text blocks the server
  attaches after the result. Currently only `ppal-connect` uses it, to deliver,
  in order, the Producer Pal skills (notation instructions), this Live Set's
  project context, your `~/.producer-pal/context.md` global context, your memory
  index, and a final next-step block. The context blocks are self-labeling
  (`Project context (this Live Set):`, `Global context (all projects):`,
  `Memory index. …`) and only appear when you've configured them; the skills and
  the next-step block are always present, so `appended` is never empty on
  `ppal-connect`. The next-step block names any empty context layers and tells
  the AI what to do next, so don't assume the last element is context. In
  compact mode these blocks are joined into the `result` string instead.
- On **error** (`isError: true`), `result` is still a plain error string
  regardless of format; error messages are not JSON.

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
  -d '{"path": "t0/s0", "length": "16bar", "notes": "..."}'
```

`timeoutMs` must be a positive integer up to **55000** (55 seconds). Other
values return **400**. The cap stays under 60 seconds because that is where most
MCP clients give up. Past that, you lose the partial results and warnings
Producer Pal returns on a timeout. Combinable with `?format=`:

```
POST /api/tools/{name}?format=json&timeoutMs=10000
```

### Per-request settings {#per-request-settings}

These headers let one client run its own profile, so a script, an agent, and the
[Chat UI](/guide/chat-ui) can each use a different notation at the same time
without a `POST /config` changing everyone else's:

| Header                            | Value                           | Overrides                                                 | Endpoints |
| --------------------------------- | ------------------------------- | --------------------------------------------------------- | --------- |
| `x-producer-pal-disabled-tools`   | comma-separated tool names      | [the toolset](/features#toolset)                          | REST, MCP |
| `x-producer-pal-small-model-mode` | `true` / `false`                | [small model mode](/features#small-model-mode)            | REST, MCP |
| `x-producer-pal-notation`         | `barbeat`, `midi-json`, `stark` | [the notation](/features/midi-notation)                   | REST, MCP |
| `x-producer-pal-live-api`         | `true` / `false`                | [the Direct Live API tool](/features/tools#ppal-live-api) | REST, MCP |
| `x-producer-pal-format`           | `compact`, `json`               | the response format                                       | MCP only  |

Absent or unrecognized values fall back to the device's global setting, so
clients that send nothing are unaffected. Nothing is remembered between requests
so **send the headers on every request**, `GET /api/tools` included, so the
schemas you read match what you send.

#### Notation {#per-request-notation}

`x-producer-pal-notation` picks the [MIDI notation](/features/midi-notation) for
one request. It decides the note syntax in the tool and argument descriptions
`GET /api/tools` serves, the syntax the [Skills](/features#skills) teach, and
(unlike the other two) how notes in your arguments are parsed and how notes in
the response are formatted.

```bash
# Read a clip's notes as a JSON array, whatever the device is set to
curl -X POST http://localhost:3350/api/tools/ppal-read-clip \
  -H 'Content-Type: application/json' \
  -H 'x-producer-pal-notation: midi-json' \
  -d '{"id": "123", "include": ["notes"]}'
```

This is the header to reach for in a coding agent: `midi-json` gives you notes
you can build and parse programmatically, without forcing the user's Chat UI off
`barbeat` mid-session.

#### Toolset {#per-request-toolset}

`x-producer-pal-disabled-tools` withholds tools from a single request. A
withheld tool disappears from `GET /api/tools` and **404**s from
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

Unrecognized names are ignored. `ppal-connect` itself can be withheld; nothing
is reserved here, unlike the `npx producer-pal` flags.

#### Small model mode {#per-request-small-model-mode}

`x-producer-pal-small-model-mode: true` shrinks the tool schemas
`GET /api/tools` serves and switches the Skills to the shorter variant. It's
aimed at local and lightweight models; see
[Small Model Mode](/features#small-model-mode).

#### Direct Live API {#per-request-live-api}

`x-producer-pal-live-api: true` adds
[`ppal-live-api`](/features/tools#ppal-live-api) to one request, even when the
device's **Setup** tab toggle is off, and `false` withholds it when the toggle
is on. It is a grant for that request only: another client on the same device
sees the toolset it asked for, which is what you want when one agent needs raw
Live Object Model access and another is being evaluated against the curated
tools.

`x-producer-pal-disabled-tools` still wins. A request that enables the tool here
and names it there does not get it.

#### Output format {#per-request-format}

`x-producer-pal-format` is the MCP endpoint's equivalent of `?format=`, since
query params aren't something MCP clients send. REST callers use the query
param; it is already per-request there.

::: tip The timeout is REST-only

`?timeoutMs=` above has no MCP equivalent, on purpose: it exists for slow
machines, a fact about the device, not about one call. Set it on the device's
**Setup** tab.

:::

## Quick Start with curl

```bash
# Read the Live Set overview
curl -X POST http://localhost:3350/api/tools/ppal-read-live-set \
  -H 'Content-Type: application/json' -d '{}'

# Read track 0 with all clips
curl -X POST http://localhost:3350/api/tools/ppal-read-track \
  -H 'Content-Type: application/json' \
  -d '{"path": "t0", "include": ["session-clips", "arrangement-clips"]}'

# List available tools
curl http://localhost:3350/api/tools
```

## Sample Scripts

Zero-dependency client examples using only built-in HTTP libraries. Copy and
modify them for your own integrations.

### Node.js

The Node.js client doubles as the Producer Pal [Agent Skill](/guide/skills)
script; see [The bundled script](/guide/skills#the-bundled-script) for the full
source and CLI reference. It works with Claude Code, Codex CLI, Gemini CLI, and
any other agent runtime that reads the `SKILL.md` convention.

- Source:
  [`examples/skills/producer-pal/ppal.mjs`](https://github.com/adamjmurray/producer-pal/tree/main/examples/skills/producer-pal/ppal.mjs)
- Requires Node.js 18+ (for built-in `fetch`)

::: warning Looping calls with a sleep in between? Node's `fetch` will stall

Node's built-in `fetch` is undici, and the copy Node 26 vendors (8.9.0) leaves a
request unsent on an idle keep-alive connection until your script's event loop
wakes for something else. If that something else is your own `sleep`, the gap
plus the stall snaps to 500ms, or 3 seconds for gaps under 3 seconds. A loop
sleeping 1s between calls spends ~3s per call instead of ~25ms.

It only affects scripts that sleep between requests; one-shot calls and
back-to-back loops are fine. Either use `node:http` instead of `fetch`, or
install a dispatcher from a version without the bug (undici fixed it in 8.10.0;
7.x predates it, but 8.9.0 itself will not help):

```js
import { Agent, setGlobalDispatcher } from "undici";
setGlobalDispatcher(new Agent());
```

This is a Node client-side issue, not something Producer Pal can fix from the
device, and it will inflate any latency you measure this way. It goes away on
its own once Node ships undici 8.10.0 or newer.

:::

### Python

Works with Python 3.6+ (no dependencies).

<<< ../../examples/rest-api/ppal.py

## Tool Reference

Use the [list tools endpoint](#list-tools) to discover all available tools and
their input schemas at runtime. You can also browse the full tool documentation
in the [Tool Reference](/features/tools).

## Live API

The `ppal-live-api` tool provides direct access to the
[Ableton Live Object Model](https://docs.cycling74.com/apiref/lom/) for
scripting and debugging.

It is opt-in: enable **Direct Live API** on the **Setup** tab of the Producer
Pal Max for Live device, or programmatically with a `POST /config` request (from
curl or a same-origin script, since cross-origin browser writes to `/config` are
rejected):

```bash
curl -X POST http://localhost:3350/config \
  -H 'Content-Type: application/json' \
  -d '{"liveApiEnabled": true}'
```

The setting is global to the device (it also affects the Chat UI and any
connected MCP clients). This is an advanced escape hatch: the higher-level tools
are tuned for reliable results, so reach for the raw Live API only for custom
integrations, scripting, or debugging when the standard tools aren't enough.

### Request structure

The `path` parameter sets the initial Live Object Model object to operate on
(e.g., `"live_set"`, `"live_set tracks 0"`,
`"live_set tracks 0 clip_slots 1 clip"`). The `operations` array is then
executed sequentially on that object. Use `goto` to navigate to a different
object mid-sequence.

Available operation types:

| Type           | Properties used             | Description                                                                                                                                  |
| -------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `get`          | `property`                  | Read a property's raw value; a `_list` property returns the full array. Returns the number `1`, not an array, when the object doesn't exist  |
| `set`          | `property`, `value`         | Write a property value. Always returns 1, even when the write is rejected, so read the property back to confirm it landed                    |
| `set_property` | `property`, `value`         | The same write as `set`, but returns the value you sent                                                                                      |
| `call`         | `method`, `args` (optional) | Call a method on the Live object                                                                                                             |
| `goto`         | `value` (path)              | Navigate to a different object                                                                                                               |
| `info`         | none                        | Get object info                                                                                                                              |
| `getcount`     | `property` (child type)     | Count the object's children in a collection. `0` when the object doesn't exist                                                               |
| `getstring`    | `property`                  | Read a property as a string. Returns the number `1`, not a string, when the object doesn't exist                                             |
| `getProperty`  | `property`                  | Read a property, unwrapped to a scalar; truncates a `_list` property to its first element, so use `get` for the full array                   |
| `getChildIds`  | `property` (child type)     | Get child object IDs                                                                                                                         |
| `exists`       | none                        | Check if the object exists. Producer Pal's judgment, not Live's: Live's own `valid` field reads 1 even for a bad path, so this checks the id |
| `getColor`     | none                        | Read object color                                                                                                                            |
| `setColor`     | `value` (hex string)        | Write object color                                                                                                                           |
| `get_property` | `property`                  | Read a JavaScript field on the LiveAPI object itself (`path`, `id`, `type`, `mode`, `valid`, `children`, …), not a Live property             |
| `call_method`  | `method`, `args` (optional) | Call a JavaScript method on the LiveAPI object itself (`getProperty`, `getChildIds`, `child`, …), not a Live method                          |
| `set_path`     | `value` (path)              | Assign the LiveAPI object's `path`, retargeting it. `""` clears it                                                                           |
| `set_mode`     | `value` (`0` or `1`)        | Assign the LiveAPI object's `mode`: `0` follows the path, `1` follows the object                                                             |

The last group operates on the JavaScript wrapper, not the Live object it points
at. Despite the names, `get`/`get_property` and `call`/`call_method` are **not**
aliases. `call get_current_beats_song_time` works, while
`call_method get_current_beats_song_time` fails because that method lives on the
Live object, not the wrapper. Only `set` and `set_property` perform the same
write, and even they report different results.

#### When the object doesn't exist

A bad path, a bad index, a bad id and a path cleared to `""` all behave the same
way, and none of them raise an error. Verified against Live 12.4.3:

- `get`, `set`, `call` and `getstring` return the number `1`
- `getcount` returns `0`
- `info` returns `"No object"`

Read a bare `1` as "no object, no answer". It is not a success flag: `set`
returns `1` on a perfectly valid object too, whether or not the write landed. A
read-only property, a wrong-typed value, an unknown property and an out-of-range
value all return `1` and change nothing. Read the property back if you need to
know whether a write took.

Normalizing that away is most of what the Producer Pal operations add over the
raw Live ones: `getProperty` gives `undefined`, `getChildIds` gives `[]`,
`getColor` gives `null`, and `exists` gives `false`. Prefer `exists` over
reading Live's own `valid` field, which reads `1` in all four cases. It
describes the wrapper object, not the target it points at.

You don't need to call `set_path ""` yourself for cleanup. Live arms a path
listener on every collection along a path-based object's path and never takes
them down, so every LiveAPI object a request creates has its path cleared once
the request ends, whether or not it succeeded.

### Examples

```bash
# Get the tempo
curl -X POST http://localhost:3350/api/tools/ppal-live-api \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "live_set",
    "operations": [{"type": "getProperty", "property": "tempo"}]
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
- The REST API shares the same tool configuration as MCP: tools enabled or
  disabled on the device apply to both interfaces.
- The REST API has no authentication (same as the MCP endpoint). It is designed
  for use on localhost or trusted networks only.
- Browser pages can only call the REST API from localhost origins by default
  (`ENABLE_REMOTE_CORS` widens this to any origin). curl and other non-browser
  clients ignore CORS entirely and are unaffected either way.
