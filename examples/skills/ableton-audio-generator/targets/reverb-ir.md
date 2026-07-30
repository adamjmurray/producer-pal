# Target: reverb impulse response

A stereo impulse response for Ableton's **Hybrid Reverb** in Convolution or
Hybrid mode. An IR is the recording of a space's response to a single impulse;
convolving a signal with it puts that signal in that space.

**Generate-and-drag.** Like Wavetable, Hybrid Reverb exposes no file-load API.
Produce the file, optionally stage a draggable clip, and leave the drop to the
user.

## Format

- **Stereo, and genuinely decorrelated.** This is the format contract that
  matters. Independent noise and independent filtering per channel is what
  creates the sense of space. Two copies of the same tail — or the same tail
  delayed — collapses to a mono reverb with a comb filter on it.
- **`float32`**, for the dynamic range across a long decay.
- **48000** or the Set's rate.
- **`normalize` with one shared gain** across both channels, which is what
  `normalize` already does. Per-channel would destroy the very image you built.
- **Fade the tail out** (`declick` with a generous `fadeOut`, tens of
  milliseconds). An IR that stops abruptly convolves that discontinuity into
  every sound passing through it.

## Anatomy

An IR has structure, and each part is a different piece of code:

1. **Predelay** — silence before anything arrives. Reads directly as distance
   from the walls. A few milliseconds to ~40ms is normal; longer becomes an
   audible slapback effect.
2. **Early reflections** — a handful of discrete taps, first arrivals off nearby
   surfaces. Their spacing is the room's _size_, and their pattern is most of
   what identifies a space as a room, a hall, or a plate.
3. **Diffuse tail** — decaying filtered noise, the reflections having smeared
   into a wash. Its decay time is the reverb's RT60; its filtering is the room's
   material — dark for soft furnishings, bright for tile and glass.

Layer all three. A tail alone sounds like a reverb effect; adding early
reflections is what makes it sound like a place.

## Landing it in Live

1. Set Hybrid Reverb to **Convolution** or **Hybrid** mode. The IR does nothing
   in the algorithmic-only mode — check this first when a user reports "no
   change".
2. Drag the `.wav` onto the device's **IR display**.
3. It appears under the **User** IR category.

To stage a draggable clip:

```bash
node ../producer-pal/ppal.mjs ppal-create-clip \
  '{"slot":"5/0","sampleFile":"/abs/path/ir-hall-2s.wav","name":"IR hall 2s","warping":false}'
```

The drag reads the file, so the IR that lands on the device is the same either
way — `warping: false` is there so the staged clip auditions as the tail you
rendered rather than a time-stretched one.

## Design notes

- **Decay time is the headline parameter.** Everything else is character. Get it
  from the user in musical terms and convert — "short room" is well under a
  second, "cathedral" is many.
- **Filter the tail over time, not just once.** Real spaces lose high
  frequencies faster than lows, so a tail that darkens as it decays sounds far
  more natural than one filtered uniformly.
- **Length costs nothing but render time.** The IR only needs to be as long as
  the decay; rendering 10 seconds of near-silence after a 1-second tail wastes
  CPU on every convolution forever after.
- **Strange IRs are legitimate.** Convolution with something that isn't a room —
  a metallic ring, a rhythmic set of taps, a reversed tail — is a real
  sound-design technique. If the user asks for something unnatural, that's a
  feature of the format, not a misuse.

## Gotchas

- **No API load** — the drop is manual.
- **Convolution or Hybrid mode only.**
- **Keep it stereo.** Hybrid Reverb wants a stereo IR; a mono file works but
  throws away the width that is most of the point.
- **Stable path** — moving the file breaks any clip referencing it and scatters
  the User category, which reflects the loaded file's folder.
