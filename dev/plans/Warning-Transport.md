# Warning Transport

Warnings reach the model as `WARNING:` content items, but they travel from V8 to
Node outside the response JSON, as trailing Max atoms after a delimiter:

```js
["mcp_response", requestId, ...chunks, MAX_ERROR_DELIMITER, ...warnings];
```

They no longer need to. This plan is to put them in the JSON and retire the
channel.

## Why the channel exists

The Max patch used to hold an `[error]` object feeding a `zl.group`, which
captured **anything** printed to the Max console — including Live API errors
raised outside V8. Those arrived as separate Max messages, so there was no way
to get them inside a JSON payload V8 had already stringified. Hence trailing
atoms, and hence a delimiter to mark where the chunks stop.

That capture was removed in January 2026, when `warn()` switched to
`outlet(1, message)`. Since then every warning is a plain string authored by V8
JS. Per-request capture (`v8-warning-capture.ts`) later moved the buffering into
V8 itself, so by the time `sendResponse` runs it already holds the warnings as
an ordered array, next to the response object it is about to stringify.

Nothing has needed the channel since. `MAX_ERROR_DELIMITER` and its value
`$$___MAX_ERRORS___$$` both still name the capture that no longer exists.

## The one hard constraint

MCP's `CallToolResult` has no warnings field, and the model only ever reads
`content`. `_meta` doesn't help — no shipping client renders it. So warnings
must be flattened into `WARNING:`-prefixed text items before they reach the SDK,
no matter how they travel. Every consumer already keys off that shape: the REST
route, the chat UI, evals, and the e2e helpers.

The design question is only _where_ the flattening happens.

## Shape

Put a `warnings?: string[]` sidecar on the response object, alongside `content`
and `isError`. `errorCode` already works this way — V8 sets it, Node reads it,
the SDK boundary strips it in `define-tool.ts`. This one is tighter still:
`handleLiveApiResult` consumes and deletes it one function after V8 produces it,
so it never travels far enough to leak.

- **V8** — `sendResponse` sets `result.warnings` when non-empty, then chunks as
  usual. Nothing follows the terminator, ever.
- **Node** — reassemble, parse, pull `warnings` off, run the existing repeat
  collapse, push the prefixed items onto `content`, delete the field. The
  duplicated inline reassembly in `handleLiveApiResult` folds back into
  `reassembleChunks`.
- **Delete** — the `v8:` prefix strip and its tests. No producer has emitted
  that prefix since the `[error]` object left; only tests feed it.

Downstream sees identical content items and needs no changes.

Rejected: wrapping as `{result, warnings}`. Same benefit, but it reworks every
`formatSuccessResponse` / `formatErrorResponse` site plus the too-large path,
and makes `mcp_response` structurally different from `node_response`.

Also rejected: having V8 push the `WARNING:` content items directly. It's a
bigger diff, not a smaller one — the repeat-collapse logic would have to migrate
out of Node.

## The terminator

Optional once warnings are off the wire — every atom after the requestId is a
chunk, so `join("")` is the whole algorithm. It can't detect truncation on a
transport that can't truncate; ADR-era commit notes record that Max IPC delivers
one message's args in-order and in-process, which is why chunk indices and
checksums were skipped too.

Keeping it is still defensible for one reason: it distinguishes "sender sent an
empty payload" from "sender sent nothing at all", which a bare `join("")`
collapses into the same vague `JSON.parse` failure. If it stays, rename the
constant and the value to say what they do — `END_OF_CHUNKS` /
`"$$___END_OF_CHUNKS___$$"`. V8 and Node ship together inside the `.amxd`, so
there's no version skew to migrate.

## Carry-overs

Two things to fix while in here:

- `live-api-adapter.ts` still says the patch "appends whatever is on outlet 1 at
  that moment" above `reportLiveApiBuildStats()`. The ordering it protects is
  real — stats must be reported before `endWarningCapture` — but the stated
  reason stopped being true when the patch-side buffer was removed.
- The Message Protocol section of `dev/Architecture.md` shows a wire format that
  was never accurate (`["mcp_response", JSON.stringify({requestId, result})]`).

## Why this is deferred

Pure internal cleanup — the model, the REST API, and the chat UI see
byte-identical output — against a change to the transport that carries every
tool call. That trade is only worth making when a release isn't in QA, since a
wire-format change invalidates any manual validation of warning behavior already
banked in real Live.
