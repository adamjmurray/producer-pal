# Runtime Boundary: Filesystem & User-Content Features

Which runtime owns the filesystem, and how per-request settings and subagent
briefings are assembled. Part of the [Architecture](README.md) docs.

Two runtimes cooperate to serve every request. **V8** (the Max `v8` object,
`src/live-api-adapter/`) holds the Live API and has **no filesystem**. **Node
for Max** (`src/mcp-server/`) runs the Express/MCP service and **owns all
filesystem access** (`node:fs`). Shipped `src/**` also cannot shell out — the
lint config bans `child_process`.

The consequence for user-content and config features (global context, custom
system prompt, `~/.producer-pal` skills overrides, and the machine-global
preferences in `~/.producer-pal/settings.json`): **all filesystem reads and
writes are handled Node-side, and these features do not touch the Live API.**
From the outside it is one MCP/REST service — it does not matter which runtime
services which part of a request. So content that must reach an external MCP
client is **injected into the `ppal-connect` result Node-side** (the same append
seam the `WARNING:` relay uses; see
`helpers/global-context/global-context-inject.ts`), rather than built in a V8
tool handler that has no way to read the files. The webui, which also has no
filesystem, round-trips through Node REST routes (`config-markdown-route.ts` and
friends) for the same reason.

This is why the built-in skills blob — historically assembled in the V8
`connect()` handler — is assembled **Node-side** once overrides enter the
picture: the override files are only readable from Node, so `buildSkills` runs
where the filesystem lives and the result is injected into `ppal-connect`.

## The embedded remote script

The chat UI can install Live's Producer Pal remote script (`remote-script/`),
and the device is a frozen `.amxd` with no repo to copy from. So the Python
sources ride inside the MCP server bundle:
`config/rolldown-plugin-embed-remote-script.mjs` replaces
`src/mcp-server/rpc/remote-script/embedded-remote-script.ts` with the files
written out as literals, and stamps `version.py` with `package.json`'s version
so an installed copy reports what installed it. The checked-in module reads the
same files off disk, which is what tests and the dev installer use.

Installing is Node-side filesystem work like any other: `GET /remote-script`
reports where Live's User Library is (read from its browser database), what is
installed there, and what `/ping` says is running; `POST /remote-script/install`
writes the folder.

The script updates separately from the device, so it drifts. Both the chat UI
header and `ppal-connect` flag it, using one rule (`remoteScriptAttention` in
`src/shared/version-check.ts`): **update** when the installed copy differs from
this build and isn't newer (`updateAvailable`), **restart** when Live runs a
different version than the installed one, in either direction (after an update
or a downgrade). Both use `!==` rather than `isNewerVersion`, which can't order
two pre-releases of one version (`-rc1` vs `-rc2`). Nothing is flagged when the
script isn't installed or another program answers on the port.

- **Chat UI:** a `(script update)` or `(restart Live)` badge beside the version
  opens Settings → Remote Script. It reads `GET /remote-script` on load, on
  window focus, and when the MCP connection comes back (Live restarted). A later
  read that succeeds clears it; a failed read leaves it as it was. It also
  follows the tab's own reads.
- **`ppal-connect`:** `withRemoteScriptNotice`
  (`src/mcp-server/helpers/connect/remote-script-notice-inject.ts`) appends a
  `remoteScript:` line after the portal line. It shares the skills' `/ping` for
  the connect (`connect-ping.ts`), reads the installed version off disk, and
  gives up after 1.5 s. A status that fails or times out adds no line.

## The device install

The portal (plain Node) can copy the bundled `Producer_Pal.amxd` into the User
Library's `Presets/MIDI Effects/Max MIDI Effect/`, the folder the remote
script's `mfl-device` lookup and the docs use. The code is `src/portal/setup/`:
`deviceFileStatus` compares the installed file with the bundled one (by the
`const VERSION = "x.y.z"` line a frozen device contains, else by bytes), and
`installDevice` copies to a temp file and renames, so a failed write keeps the
old device. A device that's newer, or can't be placed by version, is skipped
unless `force` is set. Other `Producer_Pal*.amxd` copies in the library are
reported and never deleted, because a second copy makes adding the device to a
Set ambiguous.

Both install paths share `rpc/remote-script/user-library/`: its
`user-library-fs.ts` holds every fs call on a User Library path (the CodeQL rule
in its header), and `user-library-folder.ts` validates the folder. A failure
after something changed comes back as a `failed` result that says what changed,
not a throw.

## Warnings ride inside the response JSON

V8 puts a request's warnings in a `warnings?: string[]` field on the response
object, the same way `errorCode` travels. Node's `handleLiveApiResult` pulls it
off, collapses repeats and appends `WARNING:` content items. Nothing follows the
terminator on the wire: `END_OF_CHUNKS` is only there to tell an empty payload
from no payload, which a bare `join("")` would report as the same vague
`JSON.parse` failure. The flattening to text items is for every transport, since
MCP results have no warnings field and the model reads only `content`.

## Per-request assembly

Three settings vary per caller rather than per device. Each rides an HTTP
header, and each falls back to the global config when absent, so clients that
send nothing are unaffected:

- `SMALL_MODEL_MODE_HEADER` (`src/shared/config.ts`) — shrinks tool schemas and
  selects the `basic` skills driver.
- `DISABLED_TOOLS_HEADER` (`src/shared/config.ts`) — a comma-separated
  **subtraction** from `config.tools`. It withholds those tools from
  registration _and_ drops the skills fragments that teach them
  (`src/skills/fragment-tool-gates.ts`), so a caller never pays for guidance
  about a tool it can't call.
- `NOTATION_HEADER` (`src/shared/notation.ts`, next to the `isNotation` guard it
  validates against — `config.ts` stays import-free because the webui compiles
  it under a tsconfig that rejects `.ts` import paths) — selects the notation
  variant of the skills and the notation-keyed param descriptions.

Every HTTP surface that serves tools resolves them through one
`resolveRequestProfile` (`src/mcp-server/helpers/http/request-profile.ts`):
`POST /mcp`, which builds a fresh `createMcpServer` per request, plus the REST
tool endpoints and `GET /subagent-briefing`. Sharing the resolver is the point —
REST once shipped reading only the toolset header, which left an Agent Skill no
way to pick a notation except a device-wide `POST /config`.

The subtraction shape is what the webui can actually send: its `enabledTools` is
a sparse map (absent = enabled), and the header must be set when the transport
is built — before `listTools` could reveal the catalog a whitelist would need.
Together these are what lets one server serve a full-strength orchestrator and
several narrowly-scoped subagent workers concurrently.

## Portal version

The portal and the device are updated separately, so they drift. The portal
sends its own version on every request in `PORTAL_VERSION_HEADER`
(`src/shared/config.ts`). It has to be a header: the server is stateless, so MCP
`clientInfo` from `initialize` is gone by the time a tool is called. V8 can't
see headers, so `withPortalVersion`
(`src/mcp-server/helpers/connect/portal-version-inject.ts`) appends a
`portalVersion: <version>` block to the `ppal-connect` result. When the versions
differ the block adds one sentence saying which side is older and to update it.
A caller with no header (chat UI, direct HTTP clients) gets no block.

## What the portal carries

The portal is plain Node with no repo beside it, so anything it installs has to
ship with it:

- **The remote script** is embedded in the bundle by `embedRemoteScript()`, the
  same plugin the device bundle uses. The portal never reads `remote-script/`
  from disk.
- **The frozen device** (`Producer_Pal.amxd`, ~10 MB) is a plain file next to
  `producer-pal-portal.js`, in the npm package and in the mcpb. It is not
  embedded: base64 in the bundle would be parsed on every start for a feature
  used about once, and the device's own bundle must never be able to reach it,
  or the .amxd would contain itself. `findBundledDevice()`
  (`src/portal/bundled-device.ts`) locates it and returns null when none
  shipped.

Only `npm run release:package` puts the device there, because it exists only
after the manual freeze. Every other build (dev, CI, e2e) removes any copy and
runs in "no device bundled" mode. See `dev/process/releasing.md`.

Notation is the one axis that crosses the runtime boundary. The other two are
settled entirely Node-side, but notation also decides how V8 parses and formats
clip notes (`ToolContext.notation`), and V8 holds it as a session global with no
per-request setter. So `withNotationOverride`
(`src/mcp-server/helpers/request-overrides/`) wraps `callLiveApi` and puts the
resolved value in the same `RequestOverrides` blob as
`timeoutMs`/`compactOutput` — V8's `buildRequestContext` spreads it onto the
per-request `ToolContext`. That keeps the notation a caller is _taught_
identical to the one it is _answered in_; without it a stark worker would hand
stark note strings to a bar|beat parser.

## Subagent briefings

A spawned subagent worker does not call `ppal-connect`. `GET /subagent-briefing`
(`src/mcp-server/routes/subagent-briefing-route.ts`) assembles what that call
would have taught it — the Live Set overview, the skills its toolset needs, and
the project/global context blocks — and the webui appends the result to the
worker's **system instruction** at spawn
(`webui/src/chat/sdk/subagent/subagent-briefing.ts`).

The endpoint reads the caller's profile off the **same three headers** above, so
a briefing describes exactly the toolset and notation the worker's own tool
calls will run under; one builder (`perRequestHeaders`) emits them for both.

Every spawn fetches its own briefing, even in a parallel fan-out where all the
profiles are identical. Do not collapse those into one cached fetch: the
briefing embeds a Live Set overview, and workers change the Live Set, so a later
worker would be briefed on a Set that no longer exists.

It also requires a fourth, `x-producer-pal-briefing`. It is the only read
endpoint that dispatches a Live API call, and the origin gate alone can't cover
it: Origin-less requests pass (non-browser clients need that), and a browser
sends no Origin for `<img>` or `<script>` — which also can't set a header.

Two things move the blob out of message history and into the system prompt:

- **Cost.** A worker is a fresh conversation with no history to amortize a
  cached blob against, so the connect result is written at full price every
  spawn — plus an entire inference round spent making the call. The system
  prompt is the only part of a worker's request that repeats byte-for-byte
  across spawns of the same profile, which is what makes a cache hit possible at
  all.
- **Framing.** The connect response ends with a next step written for someone
  talking to a user ("report the connection status … then wait for their
  instructions"). A briefing replaces it with the subagent framing, and drops
  the memory index (a briefed worker has no `ppal-context` to load a body with)
  and the `"conversation-only"` skills fragments — the **audience** axis in
  `src/skills/fragment-tool-gates.ts`, which exists for guidance no toolset
  could ever have decided was unnecessary.

Every failure path — server down, Live unreachable (the route answers 502),
malformed body — resolves to no briefing, and the worker keeps `ppal-connect`
and bootstraps itself the old way. A worker with neither is blind.
`ppal-context` is not handed back with it: workers never get that one, briefed
or not, so a parallel fan-out can't race on the user's context store.
