# ADR-0033: Portal settings are the client's own, so the override gate is gone

- **Status:** Accepted
- **Date logged:** 2026-08-30

## Context

[ADR-0013](0013-config-override-gate.md) gated every portal setting env var
behind `ALLOW_CONFIGURATION_OVERRIDES=true`. The reason was that the portal
pushed its settings to the device with `POST /config`, which writes
device-global state: a stock Claude Desktop extension — mcpb emits every env var
whether or not the user touched it — would have shoved `smallModelMode:false`,
`liveApiEnabled:false` and `jsonOutput:false` onto the device on every request,
clobbering the chat UI and every other client.

Settings now ride as per-request headers instead
(`src/portal/portal-settings.ts`,
`src/mcp-server/helpers/http/request-profile.ts`). A setting reaches only the
client that sent it, and the device globals are just the fallback for whatever a
request doesn't specify. The chat UI sends its own headers too. There is no
shared state left to protect.

## Decision

Drop `ALLOW_CONFIGURATION_OVERRIDES`. Env vars apply directly, like the flags
always did. The extension's `user_config` is simply the extension's config.

The three booleans stay forced: mcpb still can't express "unset", so an
untoggled checkbox sends `false`. That's fine now, because `false` is the right
default for Claude Desktop anyway — small-model mode, Direct Live API and JSON
output are each documented as "not recommended" for the models it runs. The
string settings (`NOTATION`, `TOOLS`, `DISABLE_TOOLS`) keep `""` as "follow the
device".

## Alternatives rejected

- **Keep the gate for the booleans only.** Preserves one case: turning on Direct
  Live API from the device Setup tab and having Claude Desktop pick it up. Not
  worth a settings-page toggle whose whole job is to explain itself — and a
  per-client opt-in is better asked for by the client.
- **Make the booleans tri-state string fields** (blank / on / off), like
  notation. Removes the forcing without the gate, at the cost of a text box
  where a checkbox belongs.

## Consequences

- The device Setup tab no longer changes what Claude Desktop sees for
  small-model mode, Direct Live API, or JSON output. Those live in the
  extension's own settings; the Setup tab still governs the chat UI and any
  client that sends no header.
- Ambient env vars now reach the portal unguarded, matching `MCP_SERVER_ORIGIN`
  and the logging vars. The blast radius is one client's requests.
