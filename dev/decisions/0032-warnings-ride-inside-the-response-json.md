# ADR-0032: Warnings ride inside the response JSON

- **Status:** Accepted
- **Date logged:** 2026-08-30

## Context

Warnings used to travel V8 → Node outside the response payload, as trailing Max
atoms after a delimiter named `MAX_ERROR_DELIMITER`:

```js
["mcp_response", requestId, ...chunks, MAX_ERROR_DELIMITER, ...warnings];
```

That channel existed because the Max patch held an `[error]` object capturing
anything printed to the Max console, including Live API errors raised outside
V8. Those arrived as separate Max messages, so they could not be folded into a
payload V8 had already stringified.

The capture was removed in January 2026, when `warn()` switched to
`outlet(1, message)`. Per-request capture later moved the buffering into V8
itself, so `sendResponse` already holds the warnings as an ordered array beside
the object it is about to stringify. Nothing has needed the channel since.

## Decision

Warnings go in the JSON, as a `warnings?: string[]` sidecar on the response
object — the same pattern `errorCode` uses. V8 sets it; `handleLiveApiResult`
pulls it off, collapses repeats, pushes `WARNING:`-prefixed content items onto
`content`, and deletes the field. Nothing follows the terminator, ever.

The terminator stays, renamed `END_OF_CHUNKS` / `"$$___END_OF_CHUNKS___$$"`. It
no longer marks where warnings begin, but it still separates "sender sent an
empty payload" from "sender sent nothing at all", which a bare `join("")`
collapses into the same vague `JSON.parse` failure.

The flattening to `WARNING:` text items happens regardless of transport: MCP's
`CallToolResult` has no warnings field, `_meta` is rendered by no shipping
client, and the model only reads `content`. This decision is about _where_ the
warnings travel, not whether they get flattened.

## Alternatives rejected

**Wrap the payload as `{result, warnings}`.** Same benefit, but it reworks every
`formatSuccessResponse` / `formatErrorResponse` site plus the too-large path,
and makes `mcp_response` structurally different from `node_response`.

**Have V8 push the `WARNING:` content items directly.** A bigger diff, not a
smaller one — the repeat-collapse logic would have to migrate out of Node.

**Drop the terminator entirely.** Every atom after the requestId is a chunk, so
`join("")` would be the whole algorithm. It can't detect truncation on a
transport that can't truncate — Max delivers one message's args in-order and
in-process, which is why chunk indices and checksums were skipped too — but the
empty-vs-absent distinction is worth one atom.

## Consequences

The model, the REST API, and the chat UI see byte-identical output; the change
is invisible outside `src/live-api-adapter/` and `src/mcp-server/`. The `v8:`
prefix strip goes with it, dead since the `[error]` object left.

V8 and Node ship together inside the `.amxd`, so there is no version skew to
migrate — but a wire-format change does invalidate any manual Live validation of
warning behavior already banked, which is why this landed between releases
rather than mid-QA.
