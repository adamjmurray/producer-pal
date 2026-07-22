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

1. **Set the notation to `midi-json`** — do this _first_, before listing tools:
   the active notation changes the note syntax baked into every tool and
   argument description, so it must be set before you read the schemas.
   `midi-json` represents MIDI notes as a plain JSON array, which you can
   generate and parse directly in scripts (see the Notation section below):

   ```bash
   node ppal.mjs --set-config '{"notation":"midi-json"}'
   ```

2. **List tools** to see what's available and read each tool's input schema:

   ```bash
   node ppal.mjs --list-tools
   ```

3. **Call `ppal-connect`** — its response includes the up-to-date Producer Pal
   Skills (MIDI note syntax for the active notation, code transforms,
   conventions). Treat the returned content as authoritative instructions for
   using all other tools:

   ```bash
   node ppal.mjs ppal-connect
   ```

   `ppal-connect` also confirms the device is running and reports the current
   Live Set state.

## Notation

Producer Pal encodes MIDI notes in one of three notations, selected by the
global device setting you set during bootstrap. The active notation determines
the note syntax in every tool description and in the `ppal-connect` Skills:

- **`midi-json`** (recommended for coding agents) — notes as a JSON array, e.g.
  `[{p:60,t:0,d:4,v:100}]`: `p` pitch, `t` start beat, `d` duration in beats,
  `v` velocity. Trivial to build and parse programmatically.
- **`bar|beat`** (Producer Pal's default) — a compact human-readable text format
  (e.g. `v100 n1/4 C3 1|1`), tuned for models writing notes by hand.
- **`stark`** — a simpler literal per-line `type: content` format with
  event-based drum hits.

The setting is global to the device, so it also affects the chat UI and any
connected MCP clients. Set it at the start of each session (step 1) so the
schemas and Skills you read match the notation you'll write.

## Bundled CLI

`ppal.mjs` (Node 18+, no dependencies) lives next to this file.

```bash
# Set device settings, e.g. the active notation (do this FIRST, before listing tools)
node ppal.mjs --set-config '{"notation":"midi-json"}'

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
that aren't covered by the higher-level tools. It's off by default and missing
from `--list-tools` until enabled.

Enable it programmatically (global device setting) with:

```bash
node ppal.mjs --set-config '{"liveApiEnabled":true}'
```

Not recommended as a default — the higher-level tools are tuned for reliable
results, while the raw Live API is low-level and easy to misuse. Reach for it
for custom integrations, scripting, or debugging directly against the Live
Object Model when the standard tools aren't enough. (The user can also toggle
**Direct Live API** on the device's **Setup** tab.)

## Prerequisites

- Ableton Live running with the **Producer Pal** Max for Live device loaded on a
  track. The device shows "Producer Pal Running" when ready.
- Default endpoint: `http://localhost:3350`. Override with `--url` if needed.

## References

- REST API guide: <https://producer-pal.org/guide/rest-api>
- Feature list: <https://producer-pal.org/features>
- Tool reference at runtime: `node ppal.mjs --list-tools`
