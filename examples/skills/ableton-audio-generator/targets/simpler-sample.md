# Target: Simpler sample

One synthesized sound loaded into a Simpler, so it can be played chromatically
from a MIDI track — a single drum voice, a bass hit, a mallet, a pluck, a stab,
a vocal-ish blip.

Fully automated: `SimplerDevice.replace_sample` is a native Live API method, so
Producer Pal owns the whole pipeline. No dragging.

Read this before `drum-kit.md`, which is this target repeated across pads.

## Format

- **`int16`** — Simpler analyzes the file on load and 16-bit is maximally
  compatible. Use `format: "int16"` in `writeWav`.
- **Mono.** A one-shot destined for a pad or a chromatic instrument has no use
  for a stereo image, and it doubles the file for nothing.
- **44100 or the Set's rate.** Either is fine; matching the Set avoids a
  resample.
- **Always `normalize` then `declick`.** Leave `fadeIn` at its default of 0 —
  the attack transient _is_ the character of a percussive sound, and tapering it
  is the difference between a snare and a soft thud.
- **Keep it short.** A one-shot runs until its envelope closes. Trailing silence
  is dead weight in every pad that loads it.

## Landing it in Live

Create a Simpler on a MIDI track with the sample already loaded:

```bash
node ../producer-pal/ppal.mjs ppal-create-device \
  '{"deviceName":"Simpler","path":"t6","params":[
     {"name":"sample","value":"/abs/path/bass-hit.wav"}]}'
```

`path` is an insertion path — `t6` is track index 6, which must be a **MIDI**
track. To swap the sample on a Simpler that already exists, use
`ppal-update-device` with the same `sample` param.

Confirm it took:

```bash
node ../producer-pal/ppal.mjs ppal-read-device '{"deviceId":"86","include":["sample"]}'
```

Live renames the device after the file it loaded, so a device whose name changed
to your filename is a good sign it actually decoded the audio.

## Design notes

- **The envelope is most of the identity.** Attack length decides percussive vs.
  plucked vs. bowed before any spectral choice matters.
- **Pitch it low, play it high.** Simpler transposes. Render the source around
  the bottom of its intended range; stretching down sounds worse than up.
- **Layer, don't overcomplicate one oscillator.** Most convincing one-shots are
  two or three simple parts with different envelopes — a body, a transient, and
  something noisy — summed. That is far easier to steer from a verbal note than
  a single elaborate algorithm.
- **Consistency across a set.** If you render several related sounds, normalize
  them to the same peak and keep decays proportional, or the user will spend
  their time fixing levels instead of listening.

## Gotchas

- **Single-sample mode only.** `replace_sample` does not apply to a Simpler in
  multi-sample mode; it will warn and skip.
- **MIDI track required.** Simpler is an instrument. Targeting an audio track
  fails.
- **Absolute paths only.** A relative path warns and skips — resolve before
  calling.
