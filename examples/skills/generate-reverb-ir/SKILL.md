---
name: generate-reverb-ir
description:
  Generate a stereo reverb impulse response (.wav) with plain Node.js DSP (no
  dependencies) for Ableton's Hybrid Reverb. Use when the user wants a custom
  convolution reverb / impulse response. The IR is loaded by dragging it onto
  Hybrid Reverb (there is no Live API to load it, so this is a generate-and-drag
  flow). Pairs with the producer-pal skill.
---

# Generate Reverb IR

Generate a stereo impulse response for Ableton's **Hybrid Reverb** (Convolution
engine) using only Node.js built-ins — a decaying, filtered, decorrelated noise
tail with optional discrete early reflections.

## Automation boundary (read this first)

Like `generate-wavetable` and unlike `generate-drum-kit`, this is
**generate-and-drag**. The Live API exposes no method to load an IR into Hybrid
Reverb (only integer selectors for already-associated content), so the final
step is a **manual drag**. Producer Pal produces the file and, optionally, a
draggable Session clip — it cannot perform the drop.

## Prerequisites

- The **`producer-pal`** skill for the connection (only needed for the optional
  Session-clip convenience below; the generator itself needs nothing but Node).
- Ableton Live 12 with a **Hybrid Reverb** device (Convolution or Hybrid mode).
- Node.js 18+ (no npm packages).

## Generate

`synth-ir.mjs` writes one stereo `.wav` and prints its path:

```bash
node synth-ir.mjs --out ~/Music/producer-pal-irs --decay 1.8 --predelay 20
```

Options:

- `--decay` — tail length in seconds (RT60-ish).
- `--predelay` — gap before the tail, in milliseconds.
- `--size` — stretches early-reflection spacing (bigger = larger room).
- `--tone` — `0`..`1` lowpass on the tail (0 = dark, 1 = bright).
- `--er` — `1` include discrete early reflections, `0` smooth tail only.
- `--sr` — sample rate (default 48000).

## Load it into Hybrid Reverb

1. Set Hybrid Reverb to a mode that uses the convolution IR (**Convolution** or
   **Hybrid**).
2. Drag the generated `.wav` onto the device's **IR display**. Either source
   works: the file from Finder / Live's browser, or a Session clip (below).
3. The IR appears under the **User** IR category.

### Optional: create a draggable Session clip

To drag from inside Live, use Producer Pal to drop the file into a Session slot
on an **audio track** (audio clips require an audio track):

```bash
node ../producer-pal/ppal.mjs ppal-create-clip \
  '{"slot":"<audioTrackIndex>/0","sampleFile":"/abs/path/ir-decay1_8s.wav","name":"IR 1.8s"}'
```

Then drag that clip from the Session grid onto Hybrid Reverb.

## Customizing the sound

The generator is a short recipe: exponentially-decaying per-channel noise
(independent L/R for width) through a one-pole lowpass, plus a few decaying
early reflection taps. Shape it via the flags, or edit the tap list / decay
curve in `synth-ir.mjs`. For more realistic spaces, model a
feedback-delay-network (FDN) reverb and record its impulse, or add `fili` for
proper filter design — pure-JS, bundles cleanly. Plain `Math` already yields
usable IRs.

## Gotchas

- **No API load** — the drop is manual; don't expect a tool to load it.
- **Convolution/Hybrid mode only** — the IR does nothing in the algorithmic-only
  reverb mode.
- **Stereo IR** — the file is stereo (decorrelated channels) for a wide image;
  keep it stereo for Hybrid Reverb.
- **Use a stable path** — keep the file where it lives; moving it breaks a clip
  that references it.
