# REST API

Producer Pal exposes a REST API alongside the MCP endpoint, allowing developers
to build custom clients using plain HTTP requests without the MCP SDK.

## Endpoints

All endpoints are served on the same Express server (default port 3350).

### `GET /api/tools`

Lists all enabled tools with their JSON Schema definitions.

```bash
curl http://localhost:3350/api/tools
```

Response:

```json
{
  "tools": [
    {
      "name": "ppal-connect",
      "title": "Connect",
      "description": "...",
      "annotations": { "readOnlyHint": true, "destructiveHint": false },
      "inputSchema": { "type": "object", "properties": { ... } }
    }
  ]
}
```

The tool list respects the device's tool configuration — disabled tools are not
returned.

### `POST /api/tools/:toolName`

Calls a tool by name. Request body is the tool's arguments as a JSON object.

```bash
curl -X POST http://localhost:3350/api/tools/ppal-connect \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Success response (200):

```json
{ "result": "...", "isError": false }
```

The `result` field contains the tool's response text. When the tool reports an
error, `isError` is `true` and the result contains the error message.

Error responses:

| Status | Meaning                  | Body                                                 |
| ------ | ------------------------ | ---------------------------------------------------- |
| 404    | Unknown or disabled tool | `{ "error": "Unknown or disabled tool: ..." }`       |
| 400    | Input validation failed  | `{ "error": "Validation failed", "details": [...] }` |
| 500    | Internal server error    | `{ "error": "Internal server error: ..." }`          |

## Architecture

The REST API bypasses the MCP protocol entirely. It validates inputs using the
same Zod schemas from tool definitions, then calls `callLiveApi()` directly —
the same function the MCP server uses to dispatch tool calls to the Max V8
layer.

```
REST client → Express route → Zod validation → callLiveApi() → Max V8 → Live API
MCP client  → MCP server   → Zod validation → callLiveApi() → Max V8 → Live API
```

Key files:

- `src/mcp-server/rest-api-routes.ts` — REST route handlers
- `src/mcp-server/create-express-app.ts` — Express app setup (wires in REST
  routes)
- `src/mcp-server/max-api-adapter.ts` — `callLiveApi()` implementation

## Testing

```bash
# Run REST API tests
npx vitest run src/mcp-server/tests/rest-api-routes.test.ts

# Manual testing with curl (requires Ableton running with Producer Pal)
curl http://localhost:3350/api/tools
curl -X POST http://localhost:3350/api/tools/ppal-connect -H 'Content-Type: application/json' -d '{}'
curl -X POST http://localhost:3350/api/tools/ppal-read-track -H 'Content-Type: application/json' -d '{"trackIndex": 0}'
```

## Sample Scripts

See `examples/rest-api/` for complete, dependency-free sample scripts in Node.js
and Python.
