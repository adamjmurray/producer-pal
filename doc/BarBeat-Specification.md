# bar|beat Specification

A precise, stateful music notation format for MIDI sequencing in Ableton Live.

---

## Core Syntax

```
[v<velocity>] [t<duration>] [p<probability>] note [note ...] bar|beat [bar|beat ...]
```

### Components:

- **Start Time (`bar|beat`)** Time position that emits buffered notes.
  - `bar` – 1-based bar number (integer), or omit for beat-only shorthand (`|2`)
  - `beat` – 1-based beat number within bar (float for sub-beat precision)
  - Notes are emitted ONLY at time positions
  - Buffered pitches persist and re-emit at subsequent time positions
  - Requires whitespace separation from following elements

- **Probability (`p<0.0–1.0>`)**
  - Sets note probability for following notes until changed
  - 1.0 = note always plays, 0.0 = note never plays
  - Default: 1.0
  - Requires whitespace separation from following elements

- **Velocity (`v<0–127>` or `v<min>-<max>`)**
  - Sets velocity for following notes until changed
  - Single value: `v100` (fixed velocity)
  - Range: `v80-120` or `v120-80` (random velocity between min and max,
    auto-ordered)
  - Default: 100
  - Requires whitespace separation from following elements

- **Duration (`t<float>`)**
  - Sets duration in beats for following notes until changed
  - Default: 1.0
  - Requires whitespace separation from following elements

- **Note (`C4`, `Eb2`, `F#3`, etc.)**
  - Note names follow standard pitch notation using:
    - A–G (with optional sharp `#` or flat `b`)
    - Valid pitch classes: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#,
      Bb, B
    - Invalid: `Cb`, `B#`, `Fb`, `E#` (not supported)
  - Octave is a signed integer (e.g., `C3`, `A#-1`)
  - MIDI pitch is computed as `(octave + 2) * 12 + pitchClassValue`
  - Result must be in valid MIDI range: 0–127

- **Events**
  - Multiple notes at same time separated by whitespace
  - No commas between elements
  - All state (time, probability, velocity, duration) persists across events

---

## Note Emission Rules

Notes are emitted ONLY at time positions (`bar|beat`). Pitches encountered before a time position are buffered and emitted together when a time is reached.

### Pitch Buffering

- **Consecutive pitches form chords:** `C3 E3 G3 1|1` emits all three notes at 1|1
- **First pitch after time clears buffer:** `C1 1|1 D1 1|2` emits C1 at 1|1, then D1 at 1|2
- **Pitches persist until changed:** `C1 1|1 |2 |3` emits C1 at three positions

### State Capture

State (velocity, duration, probability) is captured with each pitch when buffered:

```
v100 C3 v80 E3 1|1  // C3 has v100, E3 has v80
```

State changes after time positions update all buffered pitches:

```
v100 C4 1|1 v90 |2  // C4@v100 at 1|1, C4@v90 at 1|2
```

### Warnings

The parser warns about incomplete or inefficient notation:

- Pitches buffered but no time position to emit them
- Time positions with no pitches
- State changes after pitches but before time positions (wasted state)

These are console warnings, not errors - parsing completes successfully.

## State Management

All components are stateful:

- **Probability**: Set with `p<value>`, applies to following notes until changed
- **Velocity**: Set with `v<value>` or `v<min>-<max>`, applies to following
  notes until changed
- **Duration**: Set with `t<value>`, applies to following notes until changed

---

## Examples

```
// C major triad at bar 1, beat 1
C3 E3 G3 1|1

// Drum pattern - kick on every beat (pitch persistence)
C1 1|1 |2 |3 |4

// Layered drum pattern - kick on 1 & 3, snare on 2 & 4
C1 1|1 |3  D1 1|2 |4

// Simple melody with state changes
v100 t1.0 C3 1|1 D3 1|2 E3 1|3 F3 1|4
v80 t2.0 G3 2|1

// Sub-beat timing with floating points
v100 t0.25 C3 1|1 D3 1|1.5 E3 1|2.25 F3 1|3.75

// Drum pattern with probability and velocity variation
v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1 1|1
p0.6 Gb1 1|1.5
v90 p1.0 D1 v100 p0.9 Gb1 1|2

// Chord progression
C3 E3 G3 1|1  D3 F3 A3 1|2  E3 G3 B3 1|3  F3 A3 C4 1|4

// Velocity-shaped chord
v127 C3 v100 E3 v80 G3 1|1

// Same pitches with varying velocity (state updates after time)
v100 C4 G4 1|1 v90 |2 v80 |3 v70 |4
```

---

## Parsing Rules

1. Notes are emitted ONLY at time positions - pitches buffer until `bar|beat` is encountered
2. State is maintained throughout parsing - probability, velocity, and duration settings persist
3. Probability (`p`), velocity (`v`), and duration (`t`) capture their values with each pitch
4. State changes after time positions update all buffered pitches
5. Multiple notes at same time are whitespace-separated
6. No commas required between elements
7. Whitespace required between time positions, probability, velocity, duration, and notes
8. Velocity ranges are auto-ordered: `v120-80` becomes `v80-120`
9. First pitch after a time position clears the pitch buffer
10. Subsequent time positions re-emit the last buffered pitches (pitch persistence)

---

## AST Schema

```ts
NoteEvent[]

// Types

type BarBeat = {
  bar: number;    // e.g., 1
  beat: number;   // e.g., 1.5 (supports floating point)
};

type Note = {
  pitch: number;              // MIDI pitch (0–127)
  name: string;               // Original pitch name (e.g. "C3", "F#4")
  velocity: number;           // 0–127 (inherited from state)
  velocity_deviation: number; // 0–127 (for velocity ranges)
  probability: number;        // 0.0–1.0 (inherited from state)
  duration: number;           // float, in beats (inherited from state)
};

type NoteEvent = Note & {
  start: BarBeat;     // Absolute start time
};
```

---

## Precision

- Beat positions support floating point for sub-beat accuracy
- Equivalent to 480 PPQN timing resolution
- Beat 1.5 = halfway between beats 1 and 2
- Beat 1.25 = quarter beat after beat 1
