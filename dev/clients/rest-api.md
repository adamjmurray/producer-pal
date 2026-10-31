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

## POST /config

`GET /config` returns the device-wide settings; `POST /config` changes them. It
is for the device UI, evals and e2e tests, not for tool calls. It refuses
cross-origin browser writes.

Fields (all optional; unknown keys are ignored):

- `projectContext`, `sampleFolder`: string or `null` (`null` clears it)
- `smallModelMode`, `jsonOutput`, `liveApiEnabled`: boolean
- `notation`: one of the notations in `src/shared/notation.ts`
- `tools`: array of tool names; must be valid for the current `liveApiEnabled`
- `remoteScriptEnabled`, `remoteScriptMinVersion`: test switches for evals and
  e2e, left out of the user docs. `false` makes the remote script look
  uninstalled; a version string replaces the minimum version so a running script
  looks out of date, `null` clears it. Only a client on the same machine may
  send them: a request from a LAN address, or through an HTTP tunnel (proxy
  headers or a non-loopback `Host`), gets a 403 and nothing in the body is
  applied. Best-effort: a raw TCP forwarder (`ssh -R`, socat) can't be told
  apart

A bad body is refused whole: every field is checked first, a `400` returns
`{error, fields, validToolNames?}` naming each bad field, and nothing is
applied. Booleans must be real booleans (`"false"` is a `400`, not true). On
success it returns the new config. Code: `parseConfigBody()` in
`src/mcp-server/helpers/http/config-body.ts`, `handleConfigUpdate()` in
`src/mcp-server/create-express-app.ts`.

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
