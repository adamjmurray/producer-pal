# REST API

Producer Pal includes a REST API for building custom scripts, automation, and
integrations using plain HTTP requests — no MCP SDK needed. It also works as an
alternative interface for coding agents: download this page as Markdown (button
at the top) and give it to your agent for a complete reference.

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

Returns:

```json
{ "result": "...", "isError": false }
```

- **200** with `isError: false` — tool ran successfully
- **200** with `isError: true` — tool ran but reported an error (e.g. invalid
  path, execution error)
- **404** — unknown or disabled tool
- **400** — invalid input (includes validation details)

Warnings from the Live API appear inline in the `result` text, prefixed with
`WARNING:`. The `ppal-update-*` tools use this when updating multiple objects —
if any individual operation fails or is inapplicable (e.g. setting quantize on
an audio clip), it emits a warning and continues with the rest.

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

These scripts have **no dependencies** — they use only built-in HTTP libraries.
Copy and modify them for your own integrations.

### Node.js

Requires Node.js 18+ (for built-in `fetch`).

<<< ../../examples/rest-api/producer-pal.mjs{js}

### Python

Works with Python 3.6+ (no dependencies).

<<< ../../examples/rest-api/producer_pal.py

## Tool Reference

Use the [list tools endpoint](#list-tools) to discover all available tools and
their input schemas at runtime. You can also browse the full tool documentation
on the [Features](/features) page.

## Raw Live API

The `ppal-raw-live-api` tool provides direct access to the
[Ableton Live Object Model](https://docs.cycling74.com/apiref/lom/) for
development, scripting, and debugging. It is always available via the REST API
regardless of tool configuration.

::: warning

This is a development tool for scripting and debugging. It can read and modify
any Live Set property — use it with care.

:::

### Request structure

The `path` parameter sets the initial Live Object Model object to operate on
(e.g., `"live_set"`, `"live_set tracks 0"`,
`"live_set tracks 0 clip_slots 1 clip"`). The `operations` array is then
executed sequentially on that object. Use `goto` to navigate to a different
object mid-sequence.

Available operation types:

| Type                   | Properties used             | Description                    |
| ---------------------- | --------------------------- | ------------------------------ |
| `get_property` / `get` | `property`                  | Read a property value          |
| `set_property` / `set` | `property`, `value`         | Write a property value         |
| `call_method` / `call` | `method`, `args` (optional) | Call a method                  |
| `goto`                 | `value` (path)              | Navigate to a different object |
| `info`                 | —                           | Get object info                |
| `getProperty`          | `property`                  | Alias for `get_property`       |
| `getChildIds`          | `property` (child type)     | Get child object IDs           |
| `exists`               | —                           | Check if the object exists     |
| `getColor`             | —                           | Read object color              |
| `setColor`             | `value` (hex string)        | Write object color             |

### Examples

```bash
# Get the tempo
curl -X POST http://localhost:3350/api/tools/ppal-raw-live-api \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "live_set",
    "operations": [{"type": "get_property", "property": "tempo"}]
  }'

# Set the tempo to 140 BPM
curl -X POST http://localhost:3350/api/tools/ppal-raw-live-api \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "live_set",
    "operations": [{"type": "set_property", "property": "tempo", "value": 140}]
  }'

# Fire scene 0
curl -X POST http://localhost:3350/api/tools/ppal-raw-live-api \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "live_set",
    "operations": [{"type": "call", "method": "fire_scene_at_index", "args": [0]}]
  }'

# Chain multiple operations on one object
curl -X POST http://localhost:3350/api/tools/ppal-raw-live-api \
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

This tool is always available via the REST API. It is only available via MCP
when the `ENABLE_RAW_LIVE_API` environment variable is set at build time
(`npm run build:debug`).

:::

## Tips

- The `inputSchema` in the tool list response is standard
  [JSON Schema](https://json-schema.org/), so you can use it for client-side
  validation or code generation.
- The REST API shares the same tool configuration as MCP — tools enabled or
  disabled on the device apply to both interfaces.
- The REST API has no authentication (same as the MCP endpoint). It is designed
  for use on localhost or trusted networks only.
