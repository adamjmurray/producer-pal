# Producer Pal example skills

Agent skills that pair with [Producer Pal](https://producer-pal.org) to compose
music in Ableton Live. Each is a self-contained folder with a `SKILL.md` and,
where relevant, zero-dependency Node.js scripts. Copy the folders you want into
your agent's skills directory.

## Connect first

- **[`producer-pal`](producer-pal/)** — the foundation. Connects to Ableton Live
  over Producer Pal's local REST API and bundles a dependency-free CLI
  (`ppal.mjs`) plus the bootstrap steps (notation, tool discovery,
  `ppal-connect`). **Use this first.**

The skills below are focused follow-ups that assume the connection is already
made (via `producer-pal`'s `ppal.mjs` or any connected MCP client).

## Audio generation

- **[`ableton-audio-generator`](ableton-audio-generator/)** — synthesize audio
  from scratch with plain Node.js DSP and place it in Live. The AI writes the
  algorithm for what was actually asked for; a shared `lib/` handles WAV
  encoding, normalization, and declicking, so custom DSP costs nothing extra.

One skill covers five targets, each documented in its own `targets/*.md` that
the agent loads on demand:

| Target         | Makes                                       | How it lands                                  |
| -------------- | ------------------------------------------- | --------------------------------------------- |
| Audio clip     | Drones, textures, risers, beds — open-ended | **Automated** — `ppal-create-clip`            |
| Simpler sample | One sound, played chromatically             | **Automated** — `replace_sample`              |
| Drum kit       | One-shots across Drum Rack pads             | **Automated** — one `ppal-create-device` call |
| Wavetable      | Multi-frame tables for the Wavetable device | **Generate-and-drag** — you drop it on an osc |
| Reverb IR      | Stereo impulse responses for Hybrid Reverb  | **Generate-and-drag** — you drop it on the IR |

### Why the two tiers?

Ableton's Simpler exposes a native `replace_sample` API, so anything landing in
a Simpler — a lone sample, a whole Drum Rack — is automated end to end.
Wavetable and Hybrid Reverb have **no file-load API**, only integer selectors
for content that's already associated, so those two need a manual drag. The
skill still does the hard part (generate a correct file, optionally stage it as
a draggable Session clip); only the final drop is manual.

## Render and analyze

- **[`ableton-analyze-audio`](ableton-analyze-audio/)** — get audio _out_ of
  Live. Two halves that also work on their own:
  - **Render** the Main mix or a single track to a file (whole arrangement).
    **macOS only** — AppleScript UI automation. No API key needed, so this is
    also the way to get a plain bounce or stem on disk.
  - **Analyze** any audio file with Google's Gemini API for feedback on timbre,
    mix, and arrangement. Needs `GEMINI_KEY` (or `GEMINI_API_KEY`); works on
    files from anywhere, no Ableton involved.

Ableton exposes no Live API for rendering, so this one drives Live's
menus/dialogs with AppleScript and then polls for the rendered file — a
different shape from the generator above, which synthesizes files directly in
Node.

## Shared conventions

- **Plain-Node DSP** — oscillators, envelopes, filters, and WAV headers written
  by hand. Libraries (`fft.js`, `fili`, `wavefile`) are optional sound-design
  upgrades, never required to produce valid files.
- **Stable file paths** — Live references the audio file and writes an `.asd`
  analysis sidecar next to it. Generate into a kept folder (e.g. under
  `~/Music/…` or the current Live project's `Samples/Imported/`), not a temp
  dir.

## Prerequisites

- Ableton Live running with the **Producer Pal** Max for Live device loaded
  (shows "Producer Pal Running"). Default endpoint `http://localhost:3350`.
- Node.js 18+.
