# Target: wavetable

A series of single-cycle waveforms ("frames") concatenated into one file, which
Ableton's **Wavetable** instrument sweeps through via its position control. The
sound is the _journey_ across frames, not any one frame.

**Generate-and-drag.** The Live API exposes no method to load a file into a
Wavetable oscillator — only integer selectors over already-associated content.
Produce the file, optionally stage it as a draggable clip, and tell the user the
drop is theirs.

## Format — this is a hard contract

Unlike the other targets, geometry here is load-bearing. Get it wrong and the
file still loads; it just reads as the wrong waveform.

- **Frame size: 1024 samples per cycle.** Wavetable slices an imported file into
  fixed 1024-sample frames. There is no import dialog and no frame-size setting,
  so any other size silently splits your cycles in the wrong places. (Serum's
  2048-sample tables are the one exception — Live spots Serum's metadata and
  downsamples them. Nothing written here carries that metadata.)
- **Total length = frames × frame size, exactly.** No header padding, no
  trailing silence, no fade. A partial final frame shifts every subsequent
  cycle.
- **16 frames** is a good default; 8–64 is the useful range. More frames is a
  smoother sweep, not a better sound.
- **`float32`**, so the harmonic detail survives.
- **Never `declick`.** Frames are cyclic — they are _supposed_ to end mid-
  waveform and wrap seamlessly into the next. Tapering the ends puts a hole in
  the table. This is the single easiest mistake to make here, because the
  instinct is correct everywhere else in this skill.
- **`normalize` across the whole table, once**, after building every frame — not
  per frame. Per-frame normalization flattens the amplitude contour that makes
  the sweep feel like it's going somewhere.
- **Import with `Raw` on.** It's the oscillator's only import control, and it's
  off by default. Off, Live trims silence, fades each frame's edges to zero,
  phase-aligns and re-normalizes — undoing the last two rules on its way in.

## Anti-aliasing is correctness, not taste

A single cycle of 1024 samples supports 512 harmonics, but Wavetable plays it
back at whatever pitch is being played. Harmonics that exceed Nyquist at the
playing pitch fold back as inharmonic garbage — and it will not sound like a
bug, just like a bad wavetable.

Build additively (sum sines with explicit harmonic numbers) and cap the harmonic
count rather than drawing a naive geometric shape. A mathematically perfect saw
ramp has infinite harmonics and aliases badly; a 64-harmonic additive saw does
not. Where a request genuinely calls for a hard-edged shape, band-limit it.

## Landing it in Live

1. Have a **Wavetable** instrument on a track.
2. Drag the `.wav` onto one of its oscillators — from Finder, from Live's
   browser, or from a Session clip.
3. Turn **Raw** on, so Live imports the samples as written.
4. It appears under the oscillator's **User** category.

To stage a draggable clip, put the file on an audio track:

```bash
node ../producer-pal/ppal.mjs ppal-create-clip \
  '{"path":"t5/s0","sampleFile":"/abs/path/wavetable-glass.wav","name":"WT glass","warping":false}'
```

Then drag from the Session grid onto the oscillator. The drag reads the file, so
what lands on the oscillator is the same either way — `warping: false` is there
so the staged clip auditions as rendered rather than time-stretched.

## Design notes

The morph parameter — call it `m`, running 0 to 1 across the table — is the
whole instrument. Design _that curve_, not the endpoints:

- **Spectral growth** — start near a sine, add harmonics as `m` rises. The
  classic, and it maps directly onto "opens up" or "gets brighter".
- **Shape morphs** — duty cycle, wavefolding drive, phase distortion.
- **Formant motion** — spectral peaks that glide across harmonic numbers read as
  vowel movement.
- **Non-monotonic tables** — the sweep doesn't have to travel in one direction.
  A table that brightens then hollows out gives the position knob real
  character.

## Gotchas

- **No API load** — the drop is manual. Don't imply otherwise.
- **1024 is not negotiable** — it's Wavetable's slicing size, not a setting.
  Generate 2048 and every "frame" is half a cycle, so the sweep runs at double
  rate through waveforms that were never designed.
- **`Raw` defaults to off**, and off it reshapes every frame. Turn it on right
  after the drop or none of the format rules survive.
- **"User" is not a fixed folder** — it reflects the folder of whatever file was
  last loaded into that oscillator. Keep related tables in one directory so they
  browse together, and keep that directory stable.
