# BarBeatScript Specification

A precise, absolute-time-based music notation format for MIDI sequencing in Ableton Live.

---

## Core Syntax

```
bar.beat[.unit]:note[modifiers] [, ...]
```

### Components:

- **Start Time (`bar.beat.unit`)** Absolute timestamp for event start.

  - `bar` – 1-based bar number (integer)
  - `beat` – 1-based beat number within bar (integer)
  - `unit` – Optional. Tick offset within beat (0–479 for 480 PPQN). Defaults to `0` if omitted.

- **Note (`C4`, `F#3`, etc.)**

  - Standard pitch notation with octave
  - MIDI pitch is computed as `(octave + 2) * 12 + pitchClassValue`
  - Valid MIDI pitch range: 0–127

- **Modifiers (optional)**

  - Attached directly to a note (no whitespace)
  - Supported modifiers:

    - `v<0–127>` — Velocity (default: 70)
    - `t<float>` — Duration in beats (default: 1.0)

  - Each modifier type may only appear once per note

- **Events**

  - Multiple notes can be specified at a single start time, separated by whitespace after the colon
  - Notes share the same start time but may have individual modifiers

- **Events are comma-separated**

  - Each `startTime:noteList` is a separate event
  - A trailing comma is allowed

---

## Examples

```
// C major triad at bar 1, beat 1, unit 0
1.1.0:C3 E3 G3

// Simple melody across bars
1.1.0:C3t1, 1.2.0:D3t1, 1.3.0:E3t1, 1.4.0:F3t1, 2.1.0:G3t2,

// Sixteenth notes (120 units apart)
1.1.0:C3t0.25, 1.1.120:D3t0.25, 1.1.240:E3t0.25, 1.1.360:F3t0.25,

// Velocity variations
1.1.0:C3v100, 1.2.0:C3v80, 1.3.0:C3v60, 1.4.0:C3v40,
```

---

## Parsing Rules

1. Each event must specify a start time using `bar.beat` or `bar.beat.unit` format
2. Events are separated by commas; trailing comma is optional
3. Modifiers are parsed as part of the note token—no whitespace is allowed between a note and its modifiers
4. Modifiers must not repeat within a single note

---

## AST Schema

```ts
// BarBeatScript program
NoteEvent[]

// Types

type BarBeatUnit = {
  bar: number;    // e.g., 1
  beat: number;   // e.g., 1
  unit: number;   // e.g., 0 (default if omitted)
};

type Note = {
  pitch: number;      // MIDI pitch (0–127)
  name: string;       // Original pitch name (e.g. "C3", "F#4")
  velocity?: number;  // 0–127, optional (default 70)
  duration?: number;  // float, in beats, optional (default 1.0)
};

type NoteEvent = Note & {
  start: BarBeatUnit; // Absolute start time
};
```

---

## Future Extensions

### Event-Level Default Modifiers

Modifiers may be specified directly after the start time (with no whitespace), applying to all notes in that event
unless overridden at the note level.

**Example:**

```
1.1.0v90t0.5:C3 E3 G3     // All notes inherit v90, t0.5
1.2.0v80t0.25:C3v100 E3 A3 // E3 and A3 inherit v80, t0.25; C3 overrides velocity to 100
```

This mechanism provides expressive control with reduced repetition and mirrors grouping behavior from ToneLang.
