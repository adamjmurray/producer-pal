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

- **Frame size: 2048 samples per cycle.** A power of two, and the value Serum
  and most wavetable tooling assume. The user must set the same number in
  Wavetable's import dialog — generate at 2048 and there is nothing to explain.
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

## Anti-aliasing is correctness, not taste

A single cycle of 2048 samples supports 1024 harmonics, but Wavetable plays it
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
3. Set the import frame size to what you generated (2048).
4. It appears under the oscillator's **User** category.

To stage a draggable clip, put the file on an audio track:

```bash
node ../producer-pal/ppal.mjs ppal-create-clip \
  '{"slot":"5/0","sampleFile":"/abs/path/wavetable-glass.wav","name":"WT glass"}'
```

Then drag from the Session grid onto the oscillator.

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
- **Frame size must match on import**, or the position sweep won't align.
- **"User" is not a fixed folder** — it reflects the folder of whatever file was
  last loaded into that oscillator. Keep related tables in one directory so they
  browse together, and keep that directory stable.
