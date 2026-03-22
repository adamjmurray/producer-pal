# REST API

Producer Pal includes a REST API that lets you build custom clients, scripts,
and integrations using plain HTTP requests — no MCP SDK needed.

The REST API runs on the same server as the MCP endpoint (default port 3350) and
is available whenever the Producer Pal Max for Live device is running.

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
      "name": "ppal-connect",
      "title": "Connect",
      "description": "Connect to Ableton Live...",
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
- **200** with `isError: true` — tool ran but reported an error (e.g. timeout)
- **404** — unknown or disabled tool
- **400** — invalid input (includes validation details)

## Quick Start with curl

```bash
# Connect to Ableton Live
curl -X POST http://localhost:3350/api/tools/ppal-connect \
  -H 'Content-Type: application/json' -d '{}'

# Read the Live Set overview
curl -X POST http://localhost:3350/api/tools/ppal-read-live-set \
  -H 'Content-Type: application/json' -d '{}'

# Read track 0 with session clips
curl -X POST http://localhost:3350/api/tools/ppal-read-track \
  -H 'Content-Type: application/json' \
  -d '{"trackIndex": 0, "include": ["session-clips"]}'

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

## Tips

- Always call `ppal-connect` first — it initializes the connection and returns
  the current Live Set state.
- The `inputSchema` in the tool list response is standard
  [JSON Schema](https://json-schema.org/), so you can use it for client-side
  validation or code generation.
- The REST API shares the same tool configuration as MCP — tools enabled or
  disabled on the device apply to both interfaces.
