---
name: producer-pal
description:
  Control Ableton Live for music production via Producer Pal's local REST API —
  read and edit tracks, clips, devices, scenes, and the arrangement. Use when
  the user mentions Ableton Live, Producer Pal, music composition, MIDI editing,
  or asks to inspect or modify a Live Set.
---

# Producer Pal

[Producer Pal](https://producer-pal.org) is a Max for Live device that exposes
Ableton Live over a local REST API at `http://localhost:3350`. This skill lets
you control Ableton Live without an MCP client.

## Bootstrap (do this every session before other tool calls)

1. **List tools** to see what's available and read each tool's input schema:

   ```bash
   node ppal.mjs --list-tools
   ```

2. **Call `ppal-connect` first** — its response includes the up-to-date Producer
   Pal Skills (bar|beat notation, MIDI syntax, code transforms, conventions).
   Treat the returned content as authoritative instructions for using all other
   tools:

   ```bash
   node ppal.mjs ppal-connect
   ```

   `ppal-connect` also confirms the device is running and reports the current
   Live Set state.

## Bundled CLI

`ppal.mjs` (Node 18+, no dependencies) lives next to this file.

```bash
# Discovery
node ppal.mjs --list-tools

# Tool calls (args are a JSON object)
node ppal.mjs ppal-read-live-set
node ppal.mjs ppal-read-track '{"trackIndex": 0}'

# Long-running calls — bump the timeout (1–60000 ms)
node ppal.mjs ppal-create-clip '{"slot":"0/0","length":"16:0","notes":"..."}' --timeout-ms 10000

# Non-default URL (e.g. remote machine over a tunnel)
node ppal.mjs --url http://other-host:3350 --list-tools
```

The REST API returns JSON by default, so:

- `result` is a parsed JSON value (object, array, number, string)
- `warnings` (when present) is a `string[]` of non-fatal issues from the Live
  API
- `isError: true` indicates the tool reported an error; `result` is then a plain
  error string

## Direct Live API access

`ppal-live-api` provides direct access to the
[Live Object Model](https://docs.cycling74.com/apiref/lom/) for reads and writes
that aren't covered by the higher-level tools. It's off by default — if it's
missing from `--list-tools`, ask the user to enable **Direct Live API** on the
**Setup** tab of the Producer Pal device.

## Prerequisites

- Ableton Live running with the **Producer Pal** Max for Live device loaded on a
  track. The device shows "Producer Pal Running" when ready.
- Default endpoint: `http://localhost:3350`. Override with `--url` if needed.

## References

- REST API guide: <https://producer-pal.org/guide/rest-api>
- Feature list: <https://producer-pal.org/features>
- Tool reference at runtime: `node ppal.mjs --list-tools`
