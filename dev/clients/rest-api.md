# REST API

Producer Pal exposes a REST API alongside the MCP endpoint, allowing developers
to build custom clients using plain HTTP requests without the MCP SDK.

## Endpoints

Served on the same Express server as MCP (default port 3350):

- `GET /api/tools` — lists enabled tools with their JSON Schemas.
- `POST /api/tools/:toolName` — calls a tool with a JSON body of arguments.

The request and response contract (result format, errors, `?format`,
`?timeoutMs`, per-request settings) is documented in
[docs/guide/rest-api.md](../../docs/guide/rest-api.md).

## Security

The REST API has no authentication, consistent with the MCP endpoint. It is
designed for use on localhost or trusted networks only.

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

- `src/mcp-server/routes/rest-api-routes.ts` — REST route handlers
- `src/mcp-server/create-express-app.ts` — Express app setup (wires in REST
  routes)
- `src/mcp-server/max-api-adapter.ts` — `callLiveApi()` implementation

## Testing

```bash
# Run REST API tests
npx vitest run src/mcp-server/tests/rest-api

# Manual testing with curl (requires Ableton running with Producer Pal)
curl http://localhost:3350/api/tools
curl -X POST http://localhost:3350/api/tools/ppal-connect -H 'Content-Type: application/json' -d '{}'
curl -X POST http://localhost:3350/api/tools/ppal-read-track -H 'Content-Type: application/json' -d '{"path": "t0"}'
```

## Sample Scripts

See `examples/rest-api/` for complete, dependency-free sample scripts in Node.js
and Python.
