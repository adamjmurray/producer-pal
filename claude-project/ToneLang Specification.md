# ToneLang Specification

_A minimal, human- and LLM-friendly music notation for sequencing and MIDI._

---

## Overview

- Compact, readable text syntax for music sequences
- Supports notes, chords, rhythm, rests, and velocity
- Maps cleanly to MIDI/DAW environments
- Notes are completely legato (connected) by default, but rests can be used to create gaps

---

## Basic Syntax Rules

### 1. Notes

- Format: `<NoteName><Octave>`
  - Example: `C3` = Middle C
- Notes are case-insensitive (`c3` = `C3`)

### 2. Accidentals

- Sharps: `#` (e.g., `F#3`)
- Flats: `b` (e.g., `Eb3`)

### 3. Chords

- Enclose notes in square brackets `[]`
  - Example: `[C3 E3 G3]`

### 4. Rhythm (Duration)

- Default note = quarter note
- Use `*` for longer durations:
  - `*2` → half note
  - `*4` → whole note
- Use `/` for shorter durations:
  - `/2` → eighth note
  - `/4` → sixteenth note
- Examples: `C3*2`, `D3/2`

### 5. Rests

- Use `R` for rests
- Apply same duration modifiers:
  - `R` → quarter rest
  - `R/2` → eighth rest
  - `R*2` → half rest
- To create gaps between notes in v1.0, use rests

### 6. Velocity (Optional)

- Suffix notes/chords with `:vNN` (where NN = 1-127)
  - Example: `C3:v90`
- If omitted, defaults to standard value (e.g., 100)

---

## Expressive Features (v1.1)

### 7. Optional Articulation Symbols

These only affect a note's duration and do not impact "time until next note" behavior. In other words, using staccato is
like a short cut for using rests.

- `^` = staccato (short)
  - Idea: maybe this shortens a note's duration by half and you can apply it multiple times to repeatedly halve the
    duration.
- `_` = tie/legato (connect)
- `>` = accent (emphasize)

Open question: Notes are currently tied by default. Do we want to change that? If not, maybe we won't support legato
syntax. In future extensions we have planned for adding a global setting for default articulation behavior. Legato may
make more sense once that feature is implemented.

**Example:**

```
C3^ D3/2_ E3> F3
```

---

## Multiple Voices (v1.2)

- Separate each voice with a semicolon `;`
  - Semicolons define the voice separation. Optional newlines can help with readability.
- Each voice always starts at beat 0

---

## Example Sequences

### Simple Scale

```
C3 D3 E3 F3 G3 A3 B3 C4
```

### With Rhythm and Velocity

```
C3:v80 D3/2:v100 R/2 [E3 G3 B3]*2:v90
```

### With Articulation (v1.1)

```
C3^ D3/2_ E3> F3
```

### Multiple Voices (v1.2)

```
C4 D4 E4 F4;
R  G2 A2 B2
```

---

## Design Principles

- Notes are **non-overlapping** (for now). If overlapping is needed, use multiple voices
- All timing is quantized (16th note grid or finer)
- Future **multi-track** support will distinguish from voices and will require explicit `trackname:` labels (planned
  v1.3+)
- Future-proof: features like overlap (`~`) and tempo (`@tempo`) can be added later

---

## Future Extensions (Planned)

- Add a global setting for default articulation behavior
- Note overlap/duration (`~`) (e.g. `C4/2~1` takes up the space of an eight note w.r.t. the following note's start time,
  but is actually a quarter note in duration)
- Tempo control (e.g., `@tempo=120`)
- Multi-track support with `trackname:` (v1.3)

  **Example:**

  ```
  piano: C4 D4 E4 F4
  bass:  R  G2 A2 B2
  drums: R  R  [C2 E2]*2
  ```

- Pitch bend, modulation controls
- Swing/groove quantization
