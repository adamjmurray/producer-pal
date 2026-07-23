---
name: generate-wavetable
description:
  Generate a multi-frame wavetable .wav with plain Node.js DSP (no dependencies)
  for Ableton's Wavetable instrument. Use when the user wants a
  custom/synthesized wavetable or oscillator waveform. The file is loaded by
  dragging it onto a Wavetable oscillator (there is no Live API to load it, so
  this is a generate-and-drag flow). Pairs with the producer-pal skill.
---

# Generate Wavetable

Generate a custom wavetable — a series of single-cycle waveforms ("frames") that
Ableton's **Wavetable** instrument sweeps through via its position control —
using only Node.js built-ins.

## Automation boundary (read this first)

Unlike the `generate-drum-kit` skill, this is **generate-and-drag**. The Live
API exposes no method to load a file into a Wavetable oscillator (only integer
selectors for already-associated content), so the final step is a **manual
drag**. Producer Pal's role is to produce a correct file and, optionally, hand
you a draggable Session clip. It cannot perform the drop itself.

## Prerequisites

- The **`producer-pal`** skill for the connection (only needed for the optional
  Session-clip convenience below; the generator itself needs nothing but Node).
- Ableton Live 12 with a **Wavetable** instrument on a track.
- Node.js 18+ (no npm packages).

## Generate

`synth-wavetable.mjs` writes one `.wav` (frames concatenated) and prints its
path:

```bash
node synth-wavetable.mjs --out ~/Music/producer-pal-wavetables --type saw
```

Options:

- `--type` — `saw` (sine→saw morph), `square` (odd harmonics), `pwm` (duty
  sweep), `fold` (wavefolder), `formant` (vowel-ish spectral peaks).
- `--frames` — number of morph steps (default 16).
- `--frame-size` — samples per single cycle (default 2048).
- `--sr` — sample rate (default 48000).

## Load it into Wavetable

1. Drag the generated `.wav` onto a **Wavetable oscillator**. Either source
   works: the file from Finder / Live's browser, or a Session clip (see below).
2. On import, set the oscillator's raw/frame interpretation to the **frame
   size** you generated (default **2048** samples per cycle — a common, safe
   value that matches Serum). Getting this right makes the frames line up with
   the position control.
3. The imported table appears under the oscillator's **User** category. (That
   "User" category is dynamic — it reflects the folder of the file you loaded,
   so keep related wavetables in one folder to browse them together.)

### Optional: create a draggable Session clip

If you'd rather drag from inside Live, use Producer Pal to drop the file into a
Session slot on an **audio track** (audio clips require an audio track):

```bash
node ../producer-pal/ppal.mjs ppal-create-clip \
  '{"slot":"<audioTrackIndex>/0","sampleFile":"/abs/path/wavetable-saw.wav","name":"WT saw"}'
```

Then drag that clip from the Session grid onto the oscillator.

## Customizing the sound

Each waveform is a small function in `synth-wavetable.mjs` taking a morph
position `m` in `[0,1]`. Edit them or add your own to the `GENERATORS` map — the
additive builders (`saw`, `square`, `formant`) are the easiest to shape by
changing harmonic counts and amplitudes. For heavier spectral work, add `fft.js`
(build a spectrum, inverse-FFT each frame) — pure-JS, bundles cleanly. None of
that is required to produce valid files.

## Gotchas

- **No API load** — the drop is manual; don't expect a tool to load it.
- **Frame size must match on import** — generate and import at the same
  samples-per-cycle or the position sweep won't align.
- **Use a stable path** — keep the file where it lives; moving it breaks a clip
  that references it and scatters your User-category folder.
