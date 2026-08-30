# arrangement-sections Specification

The arrangement-side test Set: five named sections on the timeline, a group
track, an audio track and two return tracks. Purpose-built — anything that just
needs somewhere to write notes should use `basic-midi-4-track` instead.

Lives under `e2e/live-sets/` but serves **both** e2e and evals: an eval
scenario's `liveSet` takes a path, and only bare names default to
`evals/live-sets/`.

```ts
liveSet: "e2e/live-sets/arrangement-sections Project/arrangement-sections.als",
```

Saved in **Live 12.3.8** (schema `12.0_12300`), which meets `MIN_LIVE_VERSION`.
Live cannot save a Set back to an older version, so re-saving this from a newer
Live makes it unopenable by the oldest Live that Producer Pal supports.

## Global Settings

| Property       | Value                |
| -------------- | -------------------- |
| Name           | arrangement-sections |
| Tempo          | 96 BPM               |
| Time Signature | 4/4                  |
| Scale          | **F Dorian**         |
| Arrangement    | 40 bars              |
| Loop           | Off                  |

Tempo and scale differ from every other test Set on purpose: a scenario that
reads the wrong Set fails loudly rather than coincidentally passing.

**F Dorian is what this Set uniquely covers.** Every other Set is A minor, so
nothing else exercises a mode. `snap()` and `step()` snap to the Live Set scale,
and Dorian's raised 6th (D natural here) makes scale-step transposition
genuinely different from natural minor.

**4/4 on purpose.** Meter is already well covered by scenarios that set
`timeSignature` per clip. Making this Set 3/4 would give every locator, group
and audio failure meter as an extra suspect. Any scenario here can still set 3/4
at runtime — `ppal-update-live-set` takes both `timeSignature` and `scale`.

## Scenes

8 scenes, all empty, named "1" through "8" (Live's defaults). Everything in this
Set is in the arrangement.

## Locators

Five 8-bar sections. The names are the point — a scenario says "play from the
chorus" and the model has to reach for the locator rather than compute a bar.

| ID        | Name   | Position |
| --------- | ------ | -------- |
| locator-0 | Intro  | 1\|1     |
| locator-1 | Verse  | 9\|1     |
| locator-2 | Chorus | 17\|1    |
| locator-3 | Bridge | 25\|1    |
| locator-4 | Outro  | 33\|1    |

Locator IDs are positional and shift if any earlier locator is added or removed.

## Tracks

| Path | Name        | Color | Gain  | Instrument                     | Other devices       |
| ---- | ----------- | ----- | ----- | ------------------------------ | ------------------- |
| t0   | Drums       | Brown | -6 dB | **Drum Rack** (`t0/d0`)        | Channel EQ, Utility |
| t1   | Instruments | Red   | 0 dB  | — (**group**)                  | none                |
| t2   | Bass        | Red   | -6 dB | Operator "Detuned Attack Bass" | Channel EQ, Utility |
| t3   | Keys        | Green | -6 dB | Wavetable "Aaghra Keys"        | Channel EQ, Utility |
| t4   | Audio       | Blue  | -6 dB | — (audio track)                | Channel EQ, Utility |
| t5   | 6-MIDI      | Teal  | 0 dB  | —                              | Producer Pal (d0)   |

Every track is unmuted, unsoloed and centered.

- **t1 `Instruments` is a group track** (`isGroup: true`), the parent of t2 and
  t3, which both report `groupId: "106"`. It holds no clips — Live's group
  tracks only summarize their children. No other test Set has one, so this is
  the only place `isGroup` / `groupId` and `path-*` against a group are covered.
- **t2 and t3 output to `Instruments`**, not Main. t0, t1 and t4 output to Main;
  t5 is No Output.
- **t4 `Audio`** is an audio track: input `Ext. In`, monitoring `off`.

### Drum map — the un-nested shape

`t0/d0` **is** the Drum Rack. This is deliberately the opposite of
`basic-midi-4-track`, whose factory kit is an Instrument Rack _wrapping_ a Drum
Rack, putting its pads at `t0/d0/c0/d0`. Between the two Sets both nesting
shapes are covered, and here the pad paths stay short.

| Pitch | Pad              |
| ----- | ---------------- |
| C1    | synth-kick       |
| D1    | synth-snare      |
| Gb1   | synth-hat-closed |

Three pads only. Samples come from `../samples/drums/`.

## Return and Master Tracks

| Path | Name     | Device        |
| ---- | -------- | ------------- |
| rt0  | A-Delay  | Echo          |
| rt1  | B-Reverb | Hybrid Reverb |
| mt   | Main     | Limiter       |

### Sends

All sends are -70 dB (off) except these two, so the returns are real targets
rather than decoration:

| Track | Send A (Delay) | Send B (Reverb) |
| ----- | -------------- | --------------- |
| Drums | off            | **-12 dB**      |
| Keys  | **-18 dB**     | off             |

The two are deliberately crossed: the send letter and the track are
uncorrelated, so a read that confuses "send A" with "the first return I saw"
fails instead of coincidentally passing.

## Arrangement — the gaps are the point

Every clip is 8 bars and starts on its section's downbeat. Tracks enter and
exit; this is **not** 40 bars of everything.

| Track | Intro 1-8 | Verse 9-16 | Chorus 17-24 | Bridge 25-32 | Outro 33-40 |
| ----- | --------- | ---------- | ------------ | ------------ | ----------- |
| Drums | ●         | ●          | ●            | ●            | ●           |
| Bass  | —         | ●          | ●            | —            | ●           |
| Keys  | —         | —          | ●            | ●            | —           |
| Audio | —         | —          | ● (audio)    | —            | —           |

Why staggered rather than full:

1. **"Duplicate the verse to bar 33" needs somewhere to land.** All-full leaves
   no empty region to duplicate into, and no way to see that it worked.
2. **Sections have to be distinguishable.** With identical coverage everywhere,
   an assertion that "read the chorus" returned the right thing can't tell
   chorus from verse.
3. **An empty region is its own state.** Arrangement reads over a gap are
   otherwise untested.

That gives a thin section (Intro, drums only), a dense one (Chorus, all four),
and two gaps. Drums running 1-40 is the continuous reference.

### Clips

| Track | Clip name    | Start | Length | Contents                                         |
| ----- | ------------ | ----- | ------ | ------------------------------------------------ |
| t0    | Drums Intro  | 1\|1  | 8 bars | kick C1 on all 4 beats, snare D1 on 2 and 4      |
| t0    | Drums Verse  | 9\|1  | 8 bars | same                                             |
| t0    | Drums Chorus | 17\|1 | 8 bars | same                                             |
| t0    | Drums Bridge | 25\|1 | 8 bars | same                                             |
| t0    | Drums Outro  | 33\|1 | 8 bars | same                                             |
| t2    | Bass Verse   | 9\|1  | 8 bars | whole notes, one root per bar: F1 F1 Ab1 Ab1 × 2 |
| t2    | Bass Chorus  | 17\|1 | 8 bars | Bb1 Bb1 C2 C2 × 2                                |
| t2    | Bass Outro   | 33\|1 | 8 bars | F1 × 8                                           |
| t3    | Keys Chorus  | 17\|1 | 8 bars | held whole-bar chords: Fm7 Fm7 Bb Bb × 2         |
| t3    | Keys Bridge  | 25\|1 | 8 bars | Eb Eb Cm Cm × 2                                  |
| t4    | Audio Chorus | 17\|1 | 8 bars | `drum-loop-8bar.wav`, **warped**                 |

Each track's notes are deliberately simple and distinct, so an assertion reading
one track can't be satisfied by another. All drum clips are identical, so a
section is identified by which _other_ tracks are playing, never by the drums.

The Keys chords use **Bb major** (Bb D F) as the Dorian IV — its D natural is
the raised 6th, so a scale-step transform that assumes F _natural minor_ lands
on Db and gets caught.

## Sample Files

```
e2e/live-sets/samples/
├── drum-loop-8bar.wav      # t4 arrangement clip
└── drums/
    ├── synth-kick.wav      # t0/d0 pad C1
    ├── synth-snare.wav     # t0/d0 pad D1
    └── synth-hat-closed.wav # t0/d0 pad Gb1
```

All are stored as `RelativePathType 1` paths (`../samples/…`), so they resolve
from the Project folder on any clone. The Producer Pal device is relative too
(`../../../max-for-live-device/Producer_Pal.amxd`).

`drum-loop-8bar.wav` is 441000 frames at 22050 Hz — exactly 32 beats at 96 BPM,
so Live's auto-warp lands on 8 bars with no manual warp markers. Regenerate it
with `node e2e/live-sets/samples/generate-drum-loop.mjs`, which also renders
`drum-loop-1bar.wav` for `e2e-test-set` and asserts both frame counts.

**An 8-bar audio clip has to come from an 8-bar sample.** `arrangementLength` on
a looping audio clip tiles copies rather than stretching one clip, and
`end_time` is read-only on an arrangement clip — a `set` returns success and the
value does not move. That is why this fixture exists.

## What this Set covers that no other does

- Named locators for navigation ("play from the chorus", "duplicate the verse to
  bar 33")
- A group track, for `isGroup` / `groupId` reporting and `path-*` against a
  group
- An audio clip long enough to span bars — splitting, cropping, and multi-bar
  regions
- Audio clip params: `gainDb`, `pitchShift`, `warpMode`
- A non-A-minor scale, and a mode
- Return tracks as real send targets, on crossed sends
- A Drum Rack directly at `t0/d0`, un-nested
