# BarBeat Specification

A precise, stateful music notation format for MIDI sequencing in Ableton Live.

---

## Core Syntax

```
[bar|beat]  [v<velocity>] [t<duration>] [p<probability>] note [note ...]
```

### Components:

- **Start Time (`bar|beat`)** Absolute timestamp for event start.
  - `bar` – 1-based bar number (integer)
  - `beat` – 1-based beat number within bar (float for sub-beat precision)
  - Can be standalone to set default time for following notes
  - Persists until explicitly changed
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

## State Management

All components are stateful:

- **Time**: Set with `bar|beat`, applies to following notes until changed
- **Probability**: Set with `p<value>`, applies to following notes until changed
- **Velocity**: Set with `v<value>` or `v<min>-<max>`, applies to following
  notes until changed
- **Duration**: Set with `t<value>`, applies to following notes until changed

---

## Examples

```
// C major triad at bar 1, beat 1
1|1 C3 E3 G3

// Simple melody with state changes
1|1 v100 t1.0 C3
1|2 D3
1|3 E3
1|4 F3
2|1 v80 t2.0 G3

// Sub-beat timing with floating points
1|1 v100 t0.25 C3
1|1.5 D3
1|2.25 E3
1|3.75 F3

// Drum pattern with probability and velocity variation
1|1 v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1
1|1.5 p0.6 Gb1
1|2 v90 p1.0 D1
v100 p0.9 Gb1

// Complex rhythm with probability
1|1 v100 t0.5 p0.9 C3
v80 p0.7 D3 E3
t1.0 p1.0 F3
2|1.25 v120 p0.8 G3 A3
```

---

## Parsing Rules

1. State is maintained throughout parsing - time, probability, velocity, and
   duration settings persist
2. `bar|beat` can appear standalone to set time context
3. Probability (`p`), velocity (`v`), and duration (`t`) can appear standalone
   to set defaults
4. Multiple notes at same time are whitespace-separated
5. No commas required between events
6. Whitespace required between start times, probability, velocity, duration, and
   notes
7. Velocity ranges are auto-ordered: `v120-80` becomes `v80-120`

---

## AST Schema

```ts
// BarBeatScript program
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
