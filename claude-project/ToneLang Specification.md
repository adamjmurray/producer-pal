# ToneLang Specification

_A minimal, human- and LLM-friendly music notation for sequencing and MIDI._

## Overview

ToneLang is a compact, readable text syntax for musical sequences that maps cleanly to MIDI/DAW environments. It
supports notes, chords, rhythm, rests, and velocity control with a straightforward syntax that's easy for both humans
and LLMs to understand and generate.

## Core Syntax

### Note Format

```
<NoteName><Accidental><Octave><Modifiers>
```

Example: `C3` (Middle C), `F#4:v100*2` (F-sharp in octave 4, full velocity, double duration)

### Notes

- **Basic format**: `<NoteName><Octave>` (e.g., `C3`, `D4`)
- **Note names**: `A` through `G` (case-insensitive)
- **Octave**: Integer specifying the octave (e.g., `C3` where `3` is the octave)
- Middle C is defined as `C3`

### Accidentals

- **Sharp**: `#` (e.g., `C#3`)
- **Flat**: `b` (e.g., `Eb3`)
- Enharmonic equivalents are treated identically (e.g., `D#3` and `Eb3` produce the same MIDI note)

### Chords

- Enclose multiple notes in square brackets `[]`
- Example: `[C3 E3 G3]` (C major triad)
- All notes in a chord share the same start time, duration, and velocity

### Modifiers

Modifiers must be applied in this specific order (velocity, then duration):

1. **Velocity** (optional): `:vNN` where NN is 0-127
2. **Duration** (optional): `*N` or `/N` where N is a positive integer or decimal

### Velocity

- Format: `:vNN` where NN is 0-127 (e.g., `:v64`)
- Placed immediately after the note or chord, before any duration modifier
- Example: `C3:v80` (C3 at velocity 80)
- Example: `[C3 E3 G3]:v100` (C major chord at velocity 100)
- Default velocity: 100

### Duration

- Default note duration is a quarter note (1 beat)
- **Longer durations**: `*N` multiplies duration by N
  - `C3*2` = half note (2 beats)
  - `C3*1.5` = dotted quarter note (1.5 beats)
  - `C3*4` = whole note (4 beats)
- **Shorter durations**: `/N` divides duration by N
  - `C3/2` = eighth note (1/2 beat)
  - `C3/4` = sixteenth note (1/4 beat)
  - `C3/1.5` = triplet eighth note (1/1.5 beats)

### Rests

- Format: `R` with optional duration modifier
- Example: `R` (quarter rest)
- Example: `R*2` (half rest)
- Example: `R/4` (sixteenth rest)

## Sequence Syntax

Notes, chords, and rests are separated by whitespace to form sequences:

```
C3 D3 E3 F3 G3 A3 B3 C4
```

```
C3:v80 D3/2:v100 R/2 [E3 G3 B3]*2:v90
```

## Timing Behavior

- Notes are non-overlapping by default (legato)
- Each element (note, chord, or rest) advances the time cursor by its duration
- Elements are played sequentially in the order specified
- Rests create gaps in the sequence

## Examples

### Simple Scale

```
C3 D3 E3 F3 G3 A3 B3 C4
```

### With Rhythm and Velocity

```
C3:v80 D3:v100/2 R/2 [E3 G3 B3]:v90*2
```

### Complex Pattern

```
C3*2 [E3 G3] R/2 F3:v120/2 R/2 [D3 F3 A3]:v90*4
```

## Parsing & Validation Rules

1. Note names must be valid (A-G with optional # or b)
2. Octave must be an integer
3. Velocity must be within 0-127 range
4. Duration modifiers must use positive integers or decimal numbers
5. Velocity must come before duration

## Future Extensions

Planned for future versions:

- Articulation symbols (staccato, legato)
- Multiple voices/counterpoint
