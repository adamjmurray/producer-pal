# BarBeatScript Specification

A precise, stateful music notation format for MIDI sequencing in Ableton Live.

---

## Core Syntax

```
[bar:beat] [v<velocity>] [t<duration>] note [note ...]
```

### Components:

- **Start Time (`bar:beat`)** Absolute timestamp for event start.

  - `bar` – 1-based bar number (integer)
  - `beat` – 1-based beat number within bar (float for sub-beat precision)
  - Can be standalone to set default time for following notes
  - Persists until explicitly changed
  - Requires whitespace separation from following elements

- **Velocity (`v<0–127>`)**

  - Sets velocity for following notes until changed
  - Default: 70
  - Requires whitespace separation from following elements

- **Duration (`t<float>`)**

  - Sets duration in beats for following notes until changed
  - Default: 1.0
  - Requires whitespace separation from following elements

- **Note (`C4`, `F#3`, etc.)**

  - Standard pitch notation with octave
  - MIDI pitch is computed as `(octave + 2) * 12 + pitchClassValue`
  - Valid MIDI pitch range: 0–127

- **Events**

  - Multiple notes at same time separated by whitespace
  - No commas between elements
  - All state (time, velocity, duration) persists across events

---

## State Management

All components are stateful:

- **Time**: Set with `bar:beat`, applies to following notes until changed
- **Velocity**: Set with `v<value>`, applies to following notes until changed
- **Duration**: Set with `t<value>`, applies to following notes until changed

---

## Examples

```
// C major triad at bar 1, beat 1
1:1 C3 E3 G3

// Simple melody with state changes
1:1 v100 t1.0 C3
1:2 D3
1:3 E3
1:4 F3
2:1 v80 t2.0 G3

// Sub-beat timing with floating points
1:1 v100 t0.25 C3
1:1.5 D3
1:2.25 E3
1:3.75 F3

// Drum pattern with velocity changes
1:1 v100 t0.25 C1 Gb1
1:1.5 v60 Gb1
1:2 v90 D1
v100 Gb1

// Complex rhythm
1:1 v100 t0.5 C3
v80 D3 E3
t1.0 F3
2:1.25 v120 G3 A3
```

---

## Parsing Rules

1. State is maintained throughout parsing - time, velocity, and duration settings persist
2. `bar:beat` can appear standalone to set time context
3. Velocity (`v`) and duration (`t`) can appear standalone to set defaults
4. Multiple notes at same time are whitespace-separated
5. No commas required between events
6. Whitespace required between start times, velocity, duration, and notes

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
  pitch: number;      // MIDI pitch (0–127)
  name: string;       // Original pitch name (e.g. "C3", "F#4")
  velocity: number;   // 0–127 (inherited from state)
  duration: number;   // float, in beats (inherited from state)
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
