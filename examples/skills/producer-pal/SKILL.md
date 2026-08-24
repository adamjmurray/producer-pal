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

Use `--notation midi-json` on **every** call, starting with the first. It
represents MIDI notes as a plain JSON array you can generate and parse directly
in scripts (see the Notation section below), and it decides the note syntax
baked into every tool description, every argument description, and the Skills —
so the very first request that reads a schema already needs it.

1. **List tools** to see what's available and read each tool's input schema:

   ```bash
   node ppal.mjs --list-tools --notation midi-json
   ```

2. **Call `ppal-connect`** — its response includes the up-to-date Producer Pal
   Skills (MIDI note syntax for the notation you asked for, code transforms,
   conventions). Treat the returned content as authoritative instructions for
   using all other tools:

   ```bash
   node ppal.mjs ppal-connect --notation midi-json
   ```

   `ppal-connect` also confirms the device is running and reports the current
   Live Set state.

## Narrowing the toolset (optional, saves context)

`--disable-tools <names>` withholds tools from a single request. A withheld tool
disappears from `--list-tools`, 404s if called, and — the reason it's worth
doing — drops the parts of the `ppal-connect` Skills blob that teach it. The
full blob is large; a session that only reads a Live Set can cut most of it.

Decide once, then pass the same list on every call, including `ppal-connect`:

```bash
# Read-only session: no writers, so all the note-writing and transform
# instructions come off the Skills blob too
node ppal.mjs ppal-connect --disable-tools ppal-create-clip,ppal-update-clip,ppal-create-track,ppal-update-track,ppal-create-scene,ppal-update-scene,ppal-create-device,ppal-update-device,ppal-update-live-set,ppal-delete,ppal-duplicate,ppal-context,ppal-playback
```

Run `--list-tools` first if you need the exact names. Only skip tools you're
sure the task won't need — while you keep passing the same list, a withheld tool
stays unavailable, and you'd have to re-run `ppal-connect` without it to get its
instructions back.

Like `--notation`, this changes nothing on the device: it never affects the chat
UI or another client, and nothing is remembered between calls.

## Notation

Producer Pal encodes MIDI notes in one of three notations. `--notation`
determines the note syntax in every tool description and in the `ppal-connect`
Skills, and it also decides how the notes you send are parsed and how the notes
you read back are formatted:

- **`midi-json`** (recommended for coding agents) — a JSON array **passed as a
  string**, e.g. `"notes":"[{p:60,t:0,d:4,v:100}]"`: `p` pitch, `t` start beat,
  `d` duration in beats, `v` velocity. Trivial to build and parse
  programmatically.
- **`barbeat`** (Producer Pal's default) — a compact human-readable text format
  (e.g. `v100 n1/4 C3 1|1`), tuned for models writing notes by hand.
- **`stark`** — a simpler literal per-line `type: content` format with
  event-based drum hits.

`--notation` applies to the one request that carries it and nothing is
remembered between calls, so **pass it on every call** — otherwise that call
falls back to whatever the device is set to, and you get note syntax you didn't
ask for. Don't set notation with `--set-config`: that's a device-wide change
that would move the chat UI and every connected MCP client onto your notation
mid-session.

## Bundled CLI

`ppal.mjs` (Node 18+, no dependencies) lives next to this file.

```bash
# Discovery — with the notation you'll be writing in
node ppal.mjs --list-tools --notation midi-json

# Withhold tools from one request (per request, not a device setting)
node ppal.mjs ppal-connect --disable-tools ppal-library,ppal-create-device

# Tool calls (args are a JSON object)
node ppal.mjs ppal-read-live-set
node ppal.mjs ppal-read-track '{"trackIndex": 0}'
node ppal.mjs ppal-create-clip '{"path":"t0/s0","length":"16bar","notes":"[{p:60,t:0,d:4,v:100}]"}' --notation midi-json

# Long-running calls — bump the timeout (1–55000 ms)
node ppal.mjs ppal-create-clip '{"path":"t0/s0","length":"16bar","notes":"..."}' --timeout-ms 10000

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
