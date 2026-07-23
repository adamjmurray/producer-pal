# Producer Pal example skills

Agent skills that pair with [Producer Pal](https://producer-pal.org) to compose
music in Ableton Live. Each is a self-contained folder with a `SKILL.md` (and,
for the generators, a zero-dependency Node.js script). Copy the folders you want
into your agent's skills directory.

## Connect first, then generate

- **[`producer-pal`](producer-pal/)** — the foundation. Connects to Ableton Live
  over Producer Pal's local REST API and bundles a dependency-free CLI
  (`ppal.mjs`) plus the bootstrap steps (notation, tool discovery,
  `ppal-connect`). **Use this first.**

The generator skills below are focused follow-ups that assume the connection is
already made (via `producer-pal`'s `ppal.mjs` or any connected MCP client). They
synthesize audio with plain Node.js DSP — no npm packages — and hand the result
to Ableton Live.

## Sample generators

| Skill                                           | Makes                                               | How it loads                                                                      |
| ----------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| **[`generate-drum-kit`](generate-drum-kit/)**   | Synthesized drum one-shots → a playable Drum Rack   | **Fully automated** — `ppal-create-device` loads each sample into a pad's Simpler |
| **[`generate-wavetable`](generate-wavetable/)** | Multi-frame wavetables for the Wavetable instrument | **Generate-and-drag** — you drop the file onto an oscillator                      |
| **[`generate-reverb-ir`](generate-reverb-ir/)** | Stereo impulse responses for Hybrid Reverb          | **Generate-and-drag** — you drop the file onto the IR display                     |

### Why the two tiers?

Ableton's Simpler exposes a native `replace_sample` API, so Producer Pal can
build an entire drum kit end-to-end with no manual steps. Wavetable and Hybrid
Reverb have **no file-load API** — only integer selectors for content that's
already associated — so a custom wavetable or IR must be loaded by a manual
drag. Those skills still let Producer Pal do the hard part (generate a correct
file and optionally stage it as a draggable Session clip); only the final drop
is manual.

## Shared conventions

- **Plain-Node DSP** — oscillators, envelopes, filters, and a hand-written WAV
  header. Libraries (`fft.js`, `fili`, `wavefile`) are optional sound-design
  upgrades, never required to produce valid files.
- **Stable file paths** — Live references the audio file and writes an `.asd`
  analysis sidecar next to it. Generate into a kept folder (e.g. under
  `~/Music/…` or the current Live project's `Samples/Imported/`), not a temp
  dir.

## Prerequisites

- Ableton Live running with the **Producer Pal** Max for Live device loaded
  (shows "Producer Pal Running"). Default endpoint `http://localhost:3350`.
- Node.js 18+.
