---
name: ableton-audio-generator
description:
  Synthesize audio from scratch with plain Node.js DSP (no dependencies) and
  place it in Ableton Live — drum one-shots and playable Drum Racks, samples for
  Simpler, wavetables for the Wavetable instrument, impulse responses for Hybrid
  Reverb, and open-ended audio clips such as drones, textures, risers and beds.
  Use whenever someone wants generated, synthesized, or custom-designed audio in
  Live rather than existing library samples — including when they describe a
  sound in words ("gritty 808", "glassy shimmer pad", "cardboard snare") and
  expect something built to match. Pairs with the producer-pal skill, which
  makes the connection to Live.
---

# Ableton Audio Generator

Write DSP in plain Node.js, render `.wav` files, and get them into Ableton Live.

**You write the algorithm. The library writes the file.** Every request is a
different sound, so there is no default generator to run — read the request,
design the synthesis for it, and use `lib/` for the parts that are the same
every time.

## Division of labor

| Yours                                                             | The library's                                 |
| ----------------------------------------------------------------- | --------------------------------------------- |
| Oscillators, envelopes, filters, noise, modulation, the structure | WAV encoding (`encodeWav` / `writeWav`)       |
| Deciding what "gritty" or "glassy" means in DSP terms             | Peak `normalize` across channels              |
| Frame counts, lengths, layering, how many voices                  | `declick` so one-shots don't pop              |
| Everything that makes this sound different from the last one      | Flag parsing and range checks (`lib/cli.mjs`) |

The library covers exactly the failures that are **silent** — a malformed
header, a clicking tail, a table whose geometry doesn't line up. Those don't
announce themselves; they just sound broken. Anything you can hear and judge is
yours.

## Pick a target, then read its doc

Each target has its own format contract and its own way of landing in Live. Read
the one you need — do not work from this page alone.

| The user wants                                     | Read                        | Lands in Live by                       |
| -------------------------------------------------- | --------------------------- | -------------------------------------- |
| A drone, texture, riser, bed, any standalone audio | `targets/audio-clip.md`     | **Automated** — clip on an audio track |
| One sound to play chromatically from a sampler     | `targets/simpler-sample.md` | **Automated** — `replace_sample`       |
| A full kit across pads                             | `targets/drum-kit.md`       | **Automated** — one Drum Rack call     |
| A wavetable to sweep through                       | `targets/wavetable.md`      | **Manual drag** onto an oscillator     |
| A convolution reverb space                         | `targets/reverb-ir.md`      | **Manual drag** onto Hybrid Reverb     |

`targets/drum-kit.md` builds on `targets/simpler-sample.md`; read that one first
if you are making a kit.

### The automation boundary

Simpler exposes a native `replace_sample` method, so anything that ends up in a
Simpler — a lone sample, a whole Drum Rack — is fully automated end to end.
Wavetable and Hybrid Reverb expose **no file-load API**, only integer selectors
over content that is already associated. For those two the final drop is a human
gesture. Generate the file, stage it as a draggable Session clip, and say
plainly that the drag is theirs to do. Do not promise to load it.

## Translating the request

`cookbook.md` maps the words people actually use — "gritty", "boomy",
"metallic", "808", "dusty", "sounds cheap" — onto concrete parameters, with
starting numbers that were rendered and listened to rather than guessed. It is
target-agnostic, so read it **alongside** your target doc: the target doc owns
the format contract, the cookbook owns the character.

Reach for it twice — when the request describes a sound rather than specifies
one, and again when the user asks for a change in their own words.

## Working method

Generating once and declaring victory is the main failure mode. This is a loop,
and the user is in it:

1. **Ask what it should sound like** if the request is thin. "Drums" is not a
   brief; "dusty boom-bap kit, short decays, no metallic hats" is.
2. **Write a script for this request.** Import from `lib/`, invent the rest. Put
   the parameters you expect to tune behind flags so the next iteration is a
   re-run, not a rewrite.
3. **Render and land it** in Live using the target's method, so they can hear it
   in the actual arrangement rather than describe it in the abstract.
4. **Ask what to change**, in their words — darker, shorter, more air, less
   click. Map that onto parameters with `cookbook.md` and re-render. Say which
   knob you turned.
5. **Keep the script.** It is the artifact that makes iteration cheap, and it is
   theirs to keep editing after you're gone.

Prefer many small renders over one large batch. A kit where the user has heard
and approved each voice beats sixteen samples delivered at once.

## About `examples/`

`examples/` holds complete, working scripts. They exist to show **idiom** — how
a voice function is shaped, how flags are wired, how the library is called, what
a finished script looks like end to end.

They are not defaults. Running one unmodified and presenting the output as
someone's custom sound is skipping the job this skill exists to do: those files
were written for nobody in particular, and it will sound like it. Read them for
technique, then write for the request.

Reaching for one directly is right in exactly one case: the user explicitly
wants a quick starting point and doesn't care about specifics ("just give me any
kit so I can test the routing"). Say that's what you're doing.

## The library

```javascript
import { writeWav, normalize, declick } from "./lib/audio-io.mjs";
import { parseArgs } from "./lib/cli.mjs";
```

- `writeWav(path, channels, sampleRate, { format })` — `"float32"` (default,
  full headroom) or `"int16"` (what Simpler and Drum Rack want). Pass a single
  buffer for mono, an array of buffers for stereo.
- `normalize(channels, peak)` — one shared gain across channels, so stereo
  images survive.
- `declick(channels, sampleRate, { fadeIn, fadeOut })` — fade-out only by
  default, to protect transients. **Never on wavetable frames.**
- `parseArgs()` — `opt` / `num` / `int` / `flag`; `num` and `int` take a min and
  max and reject anything outside it.

Run `node lib/audio-io.mjs --selftest` to confirm the encoder on a new machine.

No npm packages are needed for any of this. `fft.js` (spectral work) and `fili`
(filter design) are pure-JS and bundle cleanly if a request genuinely calls for
them — sound design is the only reason to add a dependency, never file output.

## Prerequisites

- The **`producer-pal`** skill, for the connection to Live. Everything here
  assumes you can already call Producer Pal tools through its `ppal.mjs` or any
  connected MCP client.
- Ableton Live 12 running with the Producer Pal device loaded.
- Node.js 18+.

## Universal gotchas

- **Write to a stable, absolute path.** Live references the file where it sits
  and drops an `.asd` analysis sidecar beside it. A temp directory that gets
  cleaned leaves broken clips in a saved Set. Good homes: the current Live
  project's `Samples/Imported/`, or a kept folder like `~/Music/producer-pal/`.
- **Re-running overwrites.** Write variations to new filenames or new folders,
  or you'll destroy something the user already approved.
- **Give files descriptive names.** `kick-808-long.wav` survives; `out3.wav`
  becomes landfill in a sample folder six months from now.
