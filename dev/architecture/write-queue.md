# Write Queue

Write calls run one at a time. The decision and its rejected alternatives are in
[ADR-0059](../decisions/0059-write-calls-run-one-at-a-time.md).

Every tool call reaches V8 through `callLiveApi` in
`src/mcp-server/max-api-adapter.ts`, whether it came over MCP (portal, chat UI,
any MCP client) or REST. There, `withWriteQueue`
(`src/mcp-server/rpc/write-queue/`) sends write calls one at a time, in arrival
order, across all clients. Reads skip the queue.

V8 runs other requests while one waits on the remote script, and models send
parallel tool calls. Without the queue, one write could insert a track while
another held track and slot numbers across a wait, and the rest of the second
write landed on the wrong track.

- **What counts as a write:** a call to a tool that isn't `readOnlyHint`, unless
  its def's `changesSet` says these args leave the Set alone (a read action, a
  read-only `ppal-live-api` batch, firing clips). `ppal-manage` counts: undo and
  redo change the Set. The undo-step wrapper uses the same check, minus
  `ppal-manage`.
- **The timeout counts from arrival.** A queued write is sent with what is left
  of its timeout, so its V8 deadline shrinks too, and the caller always hears
  back within its timeout, under the MCP client's own. A write that gets down to
  `MIN_RUN_BUDGET_MS` (5 s, or half its timeout if shorter) before its turn
  leaves the queue and answers "Not run ... Nothing changed"; the exact text is
  in
  [refusals](../specs/tool-behavior/refusals.md#a-write-that-waits-for-another).
- **A caller that disconnects** leaves the queue without running: the HTTP
  request closing aborts the MCP handler's signal (and a REST response's), which
  rides down as `RequestOverrides.signal`. MCP `notifications/cancelled` aborts
  nothing: POST /mcp builds a new server per request, and the portal doesn't
  forward it. Once a write is in V8 it can't be stopped.
- **Limits.** The turn passes on when a call answers, a timeout included, so the
  next write can overlap a timed-out write V8 is still finishing. A user editing
  Live during a wait can still shift things under a write. Reads still run in
  parallel, so a read that waits on the remote script (read-clip envelopes,
  read-device macros or Simpler) can report another object's data if a write
  shifts positions meanwhile; it changes nothing.

Node also ends Live's undo step after each write; see
[write-pipeline.md](../tools/write-pipeline.md#one-undo-step-per-call).
