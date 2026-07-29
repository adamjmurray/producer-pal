# Target: audio clip

Open-ended audio that plays as a clip — drones, pads, textures, risers, noise
beds, field-recording-like ambience, sound effects, whole synthesized phrases.
No format constraints beyond "a valid `.wav`", which makes this the target for
anything that doesn't fit the other four.

Fully automated: Producer Pal creates the clip.

## Format

- **`float32`** — the default. Nothing downstream resamples or truncates it, and
  long evolving material keeps its headroom.
- **Mono or stereo**, your call. Stereo is worth it for anything ambient; use
  genuinely decorrelated channels (independent noise, independent modulation)
  rather than a copy with a delay, which collapses in mono.
- **Sample rate** should match the Set (`ppal-read-live-set`) so Live doesn't
  resample on load. 48000 is a safe default.
- **`declick` with a `fadeIn`** here, unlike one-shots. Sustained material
  usually starts mid-cycle, and a drone that begins on a nonzero sample thumps
  on every launch. A few milliseconds each end is enough; for a long ambient
  bed, a fade measured in seconds is a musical choice, not a safety one.

## Landing it in Live

Audio clips need an audio track. Create one if the Set has none:

```bash
node ../producer-pal/ppal.mjs ppal-create-track \
  '{"type":"audio","name":"Generated"}'
```

Then drop the file into a Session slot (`trackIndex/sceneIndex`, both 0-based):

```bash
node ../producer-pal/ppal.mjs ppal-create-clip \
  '{"slot":"5/0","sampleFile":"/abs/path/drone.wav","name":"Drone 20s"}'
```

Or place it on the timeline with `arrangementStart` instead of `slot`.

**Then turn warping off**, or Live time-stretches your file to the Set tempo:

```bash
node ../producer-pal/ppal.mjs ppal-update-clip \
  '{"ids":"<id from create-clip>","warping":false,"looping":false}'
```

A new audio clip arrives warped, looping, and with its region clamped to the
next full bar — so a render longer than a bar is both stretched and cut off. For
generated audio the stretch is the worse half: it alters the timbre, which is
the entire content of a synthesized sound. Neither shows up in the tool result,
which reports the clamped region as `length` and looks perfectly reasonable.

## Design notes

The interesting decisions are structural, not spectral:

- **Motion over time.** A static sum of sines is a test tone. What makes a drone
  listenable is slow independent drift — separate LFOs per partial, at rates
  that don't share a common period, so the texture never quite repeats.
- **Detuning.** Partials a few cents apart beat against each other and produce
  movement for free. Exact harmonic ratios sound synthetic; that is sometimes
  what you want.
- **Stereo from independence.** Give each channel its own noise source and its
  own modulation phases. Width that comes from decorrelation survives a mono
  fold-down; width that comes from a delay does not.
- **Length is a real parameter.** Ask. A 4-bar riser and a 3-minute bed are
  different pieces of code, and rendering minutes of audio you didn't need is
  slow for everyone.

If they want it to line up with the Set, read tempo from `ppal-read-live-set`
and compute the length in seconds from bars rather than guessing.

## Gotchas

- **Long renders are slow in plain JS.** A stereo 3-minute 48k render is ~17M
  samples per channel; keep per-sample work modest, or render a shorter loop and
  let the clip loop in Live.
- **Watch the peak.** Summed partials add up fast. `normalize` at the end is not
  optional, and clipping in `float32` won't announce itself until Live plays it.
- **A clip is not an instrument.** If they want to play the sound at different
  pitches, that's `simpler-sample.md`.
- **Check `length` against what you rendered** after disabling warp — a cheap
  confirmation that Live parsed the header the way you intended.
