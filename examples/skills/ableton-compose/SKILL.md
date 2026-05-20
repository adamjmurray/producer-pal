---
name: ableton-compose
description:
  Compose House and Techno tracks in Ableton Live via Producer Pal. Use when the
  user asks to write/sketch/draft a House, Techno, Deep-House, Tech-House, or
  Peak-Time Techno track (or asks for a 4-on-the-floor beat, a House bassline, a
  Techno drop, etc.). Provides genre-specific BPM, drum patterns, velocity
  defaults, arrangement structure, and a stepwise tool sequence. Sister skill to
  `producer-pal` (which exposes the raw tool surface); use both together.
---

# Ableton-Compose — House & Techno Workflows

This is a **composition skill**, not a tool reference. It tells you how to
assemble Producer-Pal tool calls into musically coherent House and Techno
tracks. For the raw tool surface, consult the `producer-pal` skill or call
`ppal-connect` first.

## When to use this skill

Trigger when the user asks anything like:

- "Write me a House track / Techno sketch / 4-bar Deep-House loop"
- "Make a 4-on-the-floor beat" / "lay down a House groove"
- "Bauen wir einen Techno-Drop"
- "Add a Peak-Time / Tech-House / Melodic-Techno [thing]"

**Do not use this skill** for:

- Other genres (Jazz, Orchestral, Rock, Reggae) — they are out of scope; fall
  back to general Producer-Pal tool usage.
- Audio editing, mastering, plugin parameter automation that isn't part of the
  composition itself.

## Knowledge sources to consult first

Before calling tools, the `kb-research` subagent (if available) can pull
genre-specific defaults from:

- **Ableton-Produktion-KB** §6 (House/Techno BPM ranges, sub-genre conventions)
- **Musiktheorie-KB** §4 (House/Techno chord progressions: i-VI-III-VII,
  i-iv-v-III, modal vamps; Camelot-Wheel for key compatibility)
- **Producer-Pal-Capability-KB** Anhang A (GM Drum-Note Quick-Lookup), Anhang B
  (Velocity-Defaults pro Genre/Stem)
- **Audio-Engineering-KB** §16 (Velocity-by-Role, Ghost-Notes, frequency-aware
  compensation)

If `kb-research` isn't available, the defaults below are condensed enough to
work standalone.

## Bootstrap (every session)

1. Call `ppal-connect` — returns the up-to-date Producer Pal Skills (bar|beat
   notation, MIDI syntax, transforms). Don't skip this; the skills evolve.
2. Call `ppal-context` if the user is editing an existing Live Set you don't
   know yet.

---

## House Workflow

### Defaults

| Parameter              | Value                                 |
| ---------------------- | ------------------------------------- |
| BPM                    | 120-128 (default 124)                 |
| Time Signature         | 4/4                                   |
| Scale                  | Minor / Dorian (i-VI-III-VII typical) |
| Loop length for sketch | 4 or 8 bars                           |

### Track skeleton (minimum viable House sketch)

Create in this order — each track gets its own `ppal-create-track` + matching
`ppal-create-device` + `ppal-create-clip`:

1. **Kick** — Drum Rack with kick on C1 (pitch 36). 4-on-the-floor pattern:
   ```
   v100 36 1|1   v100 36 1|2   v100 36 1|3   v100 36 1|4
   ```
2. **Hi-Hat** — Same Drum Rack or separate track. Pitches 42 (closed) + 46
   (open). Off-beat eighth-note pattern with **velocity differentiation**:
   ```
   v65 42 1|1.5 v90 42 1|2.5 v65 42 1|3.5 v90 42 1|4.5
   ```
   The alternating v65/v90 is what makes it groove — never use constant velocity
   here.
3. **Snare / Clap** — pitch 38 or 39 on beats 2 and 4:
   ```
   v95 38 1|2   v95 38 1|4
   ```
4. **Bass** — Operator/Analog/Wavetable. Root-octave bass, A1-A2 range (pitch
   33-45). Sidechain-friendly: avoid notes on the kick downbeats, or duck via
   `ppal-create-device` Compressor with audio-effect-rack side-chain. Pattern
   example for an Am vamp:
   ```
   v75 t/2 A1 1|1.5   v75 t/2 A1 1|2.5   v75 t/2 A1 1|3.5   v75 t/2 A1 1|4.5
   ```
5. **Pad / Chords** — Wavetable or Analog. Open triads, 1-2 bar held chords:
   ```
   v50 t4 A2 C3 E3 1|1
   ```

### Arrangement structure (4-minute sketch)

| Section   | Bars  | Instruments                       | Note            |
| --------- | ----- | --------------------------------- | --------------- |
| Intro     | 8-16  | Drums only (Kick + Hat, no Snare) | Build attention |
| Build     | 8     | + Bass, partial Pad               | Tension rises   |
| Drop      | 16-32 | All tracks, full energy           | Main loop       |
| Breakdown | 8-16  | Pad + filtered Bass, no Kick      | Reset           |
| Drop 2    | 16-32 | All + variations                  | Refresh         |
| Outro     | 8-16  | Inverse of intro                  | Fade            |

Use `ppal-write-automation` for filter-sweeps in the build (HP cutoff rising
over 8 bars), and `ppal-update-clip` to duplicate the drop variations.

### Sub-genre tweaks

- **Deep House:** BPM 118-122, longer chord-sustained pads, swing 60-66%
- **Tech House:** BPM 124-128, tighter bass with more percussion layers
- **Peak-Time / Big-Room:** BPM 126-130, drum velocities up by ~5 each (Anhang B
  "Peak-Time / Tech" column)

---

## Techno Workflow

### Defaults

| Parameter              | Value                                                       |
| ---------------------- | ----------------------------------------------------------- |
| BPM                    | 125-135 (default 130)                                       |
| Time Signature         | 4/4                                                         |
| Scale                  | Minor (i-iv-v-III modal vamps; often single-note basslines) |
| Loop length for sketch | 8 or 16 bars                                                |

### Track skeleton

1. **Kick** — same 4-on-the-floor, but **harder, more compressed character**.
   Same MIDI pattern as House, instrument choice differs. Velocity 95 (slightly
   over House's 90), less velocity streuung — Techno kick is monolithic.
2. **Hi-Hat / Percussion** — Off-beats + 16th-note hat layer. Reduce velocity
   range compared to House (Techno wants relentless, not bouncy).
3. **No snare on 2/4** in many sub-genres — replaced by **rim/clap on 1.4 or
   3.4** (16th-note placement, deliberately _off_ the obvious backbeat):
   ```
   v80 37 1|2.75   v80 37 1|4.75
   ```
4. **Bass** — often a single-note relentless pattern, 16th-note Off-beats under
   the kick:
   ```
   v80 t/4 A1 1|1.25 v80 t/4 A1 1|1.75 v80 t/4 A1 1|2.25 ...
   ```
5. **Lead / Stab** — short percussive notes, not melodic phrases. Often just one
   note repeated with filter modulation.

### Arrangement structure

Techno is **less verse/chorus, more "evolving texture"** than House. Pattern:

- Build the loop, then add/remove **one element every 8-16 bars**.
- Drops are often **subtle filter releases**, not "everything cuts then bangs"
  like EDM.

Use `ppal-write-automation` heavily — filter cutoff, reverb send, delay feedback
all evolve over 32-64 bars.

### Sub-genre tweaks

- **Melodic Techno:** Add pad/lead with proper chord progression, BPM 120-124
  (slower), bass less aggressive. Treat as a hybrid — read both the House and
  Techno sections.
- **Industrial / Hard Techno:** BPM 135-145, distorted kick (add Drive/
  Saturator device), no melodic content.

---

## Common pitfalls (learned from prior sessions)

- **Constant velocity** = dead pattern. If user complains "it sounds robotic,"
  re-check velocity streuung on hi-hat first.
- **Bass on the downbeat with the kick** = mud. Either side-chain or offset the
  bass to off-beats.
- **Too many drum elements at once** = clutter. House/Techno typically use 3-4
  drum elements in the main groove, add layers in the drop only.
- **Don't assume General MIDI** for drum pitches. Read the track with
  `ppal-read-track include="drum-map"` if the Drum Rack might be custom-mapped.
- **Tempo changes mid-track** are usually a sign the user wanted automation, not
  tempo edits. Confirm before calling `ppal-update-live-set tempo=...`.

## Cross-reference index

- Producer-Pal tool surface: skill `producer-pal` or call `ppal-connect`
- Drum note numbers: PRODUCER-PAL-CAPABILITY-KB Anhang A
- Velocity defaults: PRODUCER-PAL-CAPABILITY-KB Anhang B + AUDIO-ENG-KB §16
- Chord progressions, scales: MUSIKTHEORIE-KB §4
- BPM ranges, sub-genre detail: ABLETON-PRODUKTION-KB §6
