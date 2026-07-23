---
name: generate-drum-kit
description:
  Synthesize a drum kit of one-shot samples with plain Node.js DSP (no
  dependencies) and load them into a playable Ableton Live Drum Rack via
  Producer Pal. Use when the user wants generated/synthesized drums, percussion,
  or a custom drum rack built from scratch. Requires the producer-pal skill to
  make the connection first.
---

# Generate Drum Kit

Synthesize drum one-shots (kick, snare, hats, toms, clap, rim) from scratch
using only Node.js built-ins, then build a **Drum Rack** in Ableton Live with
one Producer Pal call. Each sample is loaded into a pad's auto-created Simpler,
so the result is immediately playable — **no manual drag-and-drop**.

This is the fully-automated case: `SimplerDevice.replace_sample` is a native
Live API method, so Producer Pal owns the entire pipeline. (Wavetables and
reverb IRs have no path-load API and still require a manual drag — see the
sibling `generate-wavetable` / `generate-reverb-ir` skills.)

## Prerequisites

- The **`producer-pal`** skill — use it first to connect to Ableton Live. This
  skill assumes you can already call Producer Pal tools (via that skill's
  `ppal.mjs`, or any connected MCP client). Ableton Live must be running with
  the Producer Pal device loaded.
- Node.js 18+ (for the generator; no npm packages needed).

## How it works

1. **Generate samples** — `synth-drums.mjs` (next to this file) writes one
   `.wav` per voice and prints a ready-to-use `ppal-create-device` arguments
   object that maps each drum-rack pad to its sample path:

   ```bash
   node synth-drums.mjs --out ~/Music/producer-pal-drums/kit1
   ```

   stdout is a JSON object like:

   ```json
   {
     "deviceName": "Drum Rack",
     "path": "t0",
     "params": [
       { "name": "pC1/d0/sample", "value": "/abs/path/kit1/kick.wav" },
       { "name": "pD1/d0/sample", "value": "/abs/path/kit1/snare.wav" }
     ]
   }
   ```

2. **Build the rack** — pass that object straight to `ppal-create-device`. It
   creates the Drum Rack on the target track and, for each `pNOTE/d0/sample`
   param, auto-creates that pad's Simpler and loads the sample:

   ```bash
   # via the producer-pal skill's CLI (adjust the relative path as needed):
   ARGS=$(node synth-drums.mjs --out ~/Music/producer-pal-drums/kit1)
   node ../producer-pal/ppal.mjs ppal-create-device "$ARGS"
   ```

   Or hand the same `deviceName` / `path` / `params` to `ppal-create-device`
   through your MCP client.

The `--track` flag controls the insertion path (default `t0` = first track). A
Drum Rack is an instrument, so target a **MIDI track**.

## Pad layout

Notes follow the General MIDI convention (Ableton `C1` = MIDI 36), matching the
bottom rows of a default Drum Rack:

| Pad   | MIDI | Voice      |
| ----- | ---- | ---------- |
| `C1`  | 36   | kick       |
| `C#1` | 37   | rim        |
| `D1`  | 38   | snare      |
| `D#1` | 39   | clap       |
| `F1`  | 41   | low tom    |
| `F#1` | 42   | closed hat |
| `A1`  | 45   | high tom   |
| `A#1` | 46   | open hat   |

## Customizing the sound

Each voice is a small function in `synth-drums.mjs` driven by a few parameters —
edit them or add pads to the `KIT` array:

- **kick** — `f0`/`f1` pitch sweep, `pitchK` sweep speed, `ampK` decay, `click`.
- **snare** — `tone`, `mix` (body vs. noise), decays.
- **hat** — `len` (short = closed, long = open), `metallic` ring.
- **clap** — burst count/spacing.
- **tom** — `f0`/`f1`, `len`.
- **rim** — `tone`, `len`.

The DSP is deliberately plain `Math` (oscillators, exponential envelopes,
one-pole filters, a hand-written 16-bit WAV header). For richer results, add
`fft.js` (spectral/additive bodies) or `fili` (proper filter design) — pure-JS
so they bundle cleanly. Sound design is the only reason to reach for a library;
none is needed to produce valid files.

## Gotchas

- **Use absolute, stable paths** — Live references the file and writes an `.asd`
  analysis sidecar next to it. Don't generate into a temp dir that gets cleaned;
  a good home is under the current Live project's `Samples/Imported/` (resolve
  via `live_set` `file_path`) or a kept folder like
  `~/Music/producer-pal-drums`.
- **Single-sample Simpler only** — `replace_sample` targets a Simpler in
  single-sample mode (the pad default). It does not apply to multi-sample mode.
- **Drum Rack goes on a MIDI track** — target a MIDI track with
  `--track`/`path`.
- **Re-running overwrites** the `.wav` files in `--out`; create a new kit
  directory to keep variations.
