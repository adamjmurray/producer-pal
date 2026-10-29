# How a Tool Reaches the Remote Script

The Producer Pal remote script (`remote-script/`) is Python running inside Live,
serving HTTP on `127.0.0.1`. Some things only Python can do (loading plug-ins,
reading clip envelopes, rack macro mappings, copying a device in place), and Max
can't reach them. For installing and updating the script see
[runtime-boundary.md](runtime-boundary.md); for its routes, port and threading
see [remote-script/README.md](../../remote-script/README.md).

## The call path

```
tool (V8) -> requestNode -> Node route -> remote-script-client -> HTTP -> routes.py -> reply
```

1. A tool in V8 calls `remoteScriptRoute()` (reads) or `remoteScriptChange()`
   (changes the Set) in `src/tools/shared/remote-script/remote-script-route.ts`.
   They send a Node request (`requestNode`) and fold every way it can fail
   (silence, out-of-date, out of time, too large) into one outcome.
2. Node answers with a route registered in
   `src/mcp-server/rpc/remote-script/remote-script-routes.ts`. The forwarding
   ones live in `forwarded/` and call `remoteScriptRequest()`
   (`remote-script-client.ts`), which finds the port and POSTs to the script.
3. The script (`bridge.py`) queues the job; Live's main thread runs the matching
   handler in `routes.py` and the reply goes back the same way.

## Contract files

Names, request and reply shapes, and timeouts that V8 and Node both need live in
`*-contract.ts` files beside the feature (`remote-script-envelope-contract.ts`,
`remote-script-convert-contract.ts`, `rack-macros-contract.ts`,
`device-basics-contract.ts`, `simpler-settings-contract.ts`,
`manage-contract.ts`, and the device one in
`src/tools/device/create/helpers/remote-script-contract.ts`). They hold only
types and constants, so both runtimes can import them. Python spells fields in
snake_case; the forwarding route translates.

## Adding a route

1. Python: write the handler, add it to that module's `ROUTES`, and merge it
   into `ROUTES` in `routes.py`. If it changes the Set, add its path to
   `POST_ONLY` in `bridge.py` too (a browser can send GET with no Origin).
2. A contract file: the Node route name, and the request and reply types.
3. Node: register the route in `remote-script-routes.ts` (or a `forwarded/`
   module), usually through `forwardRemoteScriptRequest()`.
4. V8: call `remoteScriptRoute()` or `remoteScriptChange()`. Say what to tell
   the model when the script is missing (`missing`).
5. Tests: a Python test in `remote-script/tests/`, and for a change, the entry
   in `remote-script-write-expiry.test.ts`, which also fails if `POST_ONLY` and
   the table disagree.

**Every route that changes the Set carries an expiry.** `remoteScriptChange()`
sends `expiresInMs`; Node passes it as `expires_in_ms`. If Live hasn't started
the job by then, it skips it, so a change V8 already reported as failed doesn't
land late. A Node route for a change throws if `expiresInMs` is missing
(`requireExpiry`). Reads carry none.

## Availability and old scripts

A script that is not running, too old, or silent is "unavailable". Every caller
falls back or refuses as it does when no script is installed; it never fails the
whole call over detail it could do without. Where the answer would say the
script is missing, it says it is out of date when that is the case
(`whyUnavailable`, `outdated-remote-script.ts`).

- The server's minimum is `MIN_REMOTE_SCRIPT_VERSION`
  (`port/remote-script-version.ts`); the version bump raises it at each release
  where the script changed. The client learns the running version from `/ping`
  and holds back requests to an older script before sending them.
- A 404 that lists `routes` means the script lacks the route: a different build
  of the same version, or too old.
- `POST /config` can fake either state on a debug build:
  `remoteScriptEnabled: false`, or a `remoteScriptMinVersion`.

How each tool words this to the model: the
[tool-behavior spec](../specs/tool-behavior/refusals.md#a-remote-script-that-is-out-of-date).

## Port

The client uses 3349 if the script answers there, else the port in
`~/.producer-pal/remote-script-port.txt`, else 3349. `PPAL_REMOTE_SCRIPT_PORT`
overrides it (tests). Details in the script README's Port section;
`port/remote-script-port.ts`.

## Skills

The Skills teach a remote-script feature only while a current script answers.
`ppal-connect` pings once (shared with the version notice), and
`withRemoteScriptAnswer()` (`src/mcp-server/helpers/skills-inject.ts`) passes
the result to the Skills build, which drops the fragments in
`REMOTE_SCRIPT_FRAGMENTS` (`src/skills/fragment-tool-gates.ts`). Small-model
mode skips the ping. See [skills.md](skills.md).

## Undo and write order

Write calls run one at a time through a Node queue
([write-queue.md](write-queue.md)), and Node ends Live's undo step after each
one. See [write-pipeline.md](../tools/write-pipeline.md#one-undo-step-per-call).
