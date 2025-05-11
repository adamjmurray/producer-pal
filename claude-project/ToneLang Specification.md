# ToneLang Specification

_A minimal, human- and LLM-friendly music notation for sequencing and MIDI._

## Overview

ToneLang is a compact, readable text syntax for musical sequences that maps cleanly to MIDI/DAW environments. It
supports notes, chords, rhythm, rests, and velocity control with a straightforward syntax that's easy for both humans
and LLMs to understand and generate.

## Core Syntax

### Syntax Overview

```
ToneLangExpression ::= Sequence | MultiVoice

MultiVoice ::= Sequence (";" Sequence)+
Sequence   ::= Element? (WS Element)*
Element    ::= Note | Chord | Rest

Note       ::= Pitch Velocity? Duration?
Pitch      ::= PitchClass Octave
PitchClass ::= "C" | "C#" | "Db" | "D" | "D#" | "Eb" | "E" | "F" | "F#" | "Gb" | "G" | "G#" | "Ab" | "A" | "A#" | "Bb" | "B"
Octave     ::= SignedInteger  // -2 to 8 for valid MIDI range

Chord      ::= "[" Note (WS Note)* "]" Velocity? Duration?

Rest       ::= "R" Duration?

Velocity          ::= ExplicitVelocity | ShorthandVelocity
ExplicitVelocity  ::= "v" Digit Digit? Digit?
ShorthandVelocity ::= "<" | "<<" | "<<<" | ">" | ">>" | ">>>"

Duration          ::= Multiplier | Divider
Multiplier        ::= "*" UnsignedDecimal
Divider           ::= "/" UnsignedDecimal

SignedDecimal   ::= "-"? UnsignedDecimal
UnsignedDecimal ::= UnsignedInteger ("." UnsignedInteger)?
SignedInteger   ::= "-"? UnsignedInteger
UnsignedInteger ::= Digit+
Digit           ::= "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
WS (whitespace) ::= (" " | "\t" | "\n" | "\r")+
```

- In between tokens, extra whitespace is allowed (e.g. around the ";" in MultiVoice)
- Octave can range from -2 to 8
- Velocity can range from 0 to 127
- Default velocity is 70
- Default duration is 1 quarter note (and usually this is 1 beat)

### Examples

#### Basic Elements

- Note: `C3` (C in octave 3, quarter note)
- Note with modifiers: `E4v80*2` (E in octave 4, velocity 80, half note)
- Chord: `[C3 E3 G3]` (C major triad)
- Chord with modifiers: `[D3 F#3 A3]v90/2` (D major triad, velocity 90, eighth note)
- Rest: `R*2` (half note rest)

#### Simple Sequence

`C3 D3 E3 F3 G3 A3 B3 C4` (C major scale, quarter notes)

#### Complex Sequence

`C3v90*2 [E3 G3]<<< R/2 F3>/4 [C4 E4 G4]v100*4`

#### Two-Voice Counterpoint

`C3 D3 E3 F3; G2 A2 B2 C3`

#### Three-Voice Pattern with Mixed Rhythms

`C3*2 D3/2 E3/2; G2*3 A2; [C4 E4 G4]v90*4`

### Pitches

- PitchClass is a note name and optional accidental
  - Note names: `A` through `G` (case-sensitive)
  - Accidentals
    - Sharp: `#` (e.g., `C#3`)
    - Flat: `b` (e.g., `Eb3`)
- Octave: Integer specifying the octave in the range -2 to 8 (e.g., `C3` where `3` is the octave. `C-2` is the lowest
  pitch at MIDI pitch 0)
- Middle C is defined as `C3`
- Enharmonic equivalents are treated identically (e.g., `D#3` and `Eb3` produce the same MIDI note)

### Chords

- Enclose multiple notes in square brackets `[]`
- Example: `[C3 E3 G3]` (C major triad)
- All notes in a chord share the same start time, duration, and velocity unless individually modified

### Chords and Note Overrides

- Individual notes within a chord can have their own velocity and duration modifiers
- Priority of modifiers:
  1. Individual note modifiers (highest priority)
  2. Chord-level modifiers (middle priority)
  3. Default values (lowest priority)
- Example: `[C3v100 E3 G3*2]v80*4`
  - C3: velocity=100 (note override), duration=4 (chord level)
  - E3: velocity=80 (chord level), duration=4 (chord level)
  - G3: velocity=80 (chord level), duration=2 (note override)

### Modifiers

Modifiers must be applied in this specific order:

1. **Velocity** (optional): Either shorthand `<` and `>` symbols or explicit `vNN` format
2. **Duration** (optional): `*N` or `/N` where N is a positive integer or decimal

### Velocity

#### Explicit Velocity

- Format: `vNN` where NN is 0-127 (e.g., `v64`)
- Placed immediately after the note or chord, before any duration modifier
- Example: `C3v80` (C3 at velocity 80)
- Example: `[C3 E3 G3]v100` (C major chord at velocity 100)
- Default velocity: 70

#### Shorthand Velocity

- Format: Up to three `<` or `>` symbols
- `>` increases velocity (louder), `<` decreases velocity (quieter)
- Mapping:
  - `C4>>>` = velocity 127 (very loud)
  - `C4>>` = velocity 110 (louder)
  - `C4>` = velocity 90 (loud)
  - `C4` = velocity 70 (default)
  - `C4<` = velocity 50 (quiet)
  - `C4<<` = velocity 30 (quieter)
  - `C4<<<` = velocity 10 (very quiet/minimum)
- When applied to chords, affects all notes within
- Example: `[C3 E3 G3]>>` (C major chord, louder)

#### Velocity Stacking

- Velocity modifiers stack when applied to both individual notes in a chord and the chord itself
- Each note's final velocity is the base 70 plus the sum of all applicable modifiers
- Each `>` adds 20 to velocity, each `<` subtracts 20 from velocity
- Example: `[C4> G4>>]>` results in:
  - C4: 70 (base) + 20 (`>`) + 20 (chord's `>`) = 110
  - G4: 70 (base) + 40 (`>>`) + 20 (chord's `>`) = 130, capped at 127
- Explicit velocity (`vNN`) always takes precedence over shorthand modifiers

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
C3< D3>/2 R/2 [E3 G3 B3]<<*2
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
C3< D3>/2 R/2 [E3 G3 B3]<<*2
```

### Complex Pattern with Shorthand Velocity

```
C3<<*2 [E3< G3>] R/2 F3<<<v120/2 R/2 [D3 F3 A3]<<*4
```

### Chord with Note Overrides

```
[C3v90*2 E3 G3v70/2]v80*4
```

## Parsing & Validation Rules

1. Note names must be valid (A-G with optional # or b)
2. Octave must be an integer
3. Velocity must be within 0-127 range (automatically capped)
4. Duration modifiers must use positive integers or decimal numbers
5. Velocity modifiers must come before duration modifiers

# Multi-Voice Support

## Multiple Voices

ToneLang supports polyphonic compositions with independent voices using semicolons:

```
<voice1>; <voice2>; <voice3>
```

- Voices are separated by semicolons (`;`)
- Each voice starts at time zero and plays simultaneously
- Voices can have different rhythms, note patterns, and durations
- Whitespace including newlines after semicolons is ignored

## When to Use

- **Multiple Voices**: For independent musical lines that overlap or run simultaneously with different rhythms
  (counterpoint)
- **Chords**: For notes that should always sound together with the same rhythm and duration

## Examples

Basic two-voice counterpoint:

```
C3< D3 E3 F3<; G2>> A2 B2> C3
```

Complex rhythmic interaction:

```
C3<<*2 D3< E3>/2 F3>/2;
G2>>*4 A2>*2
```

Voice crossing with different rhythms:

```
C3< D3 E3< F3< G3<;
G3> F3> E3> D3> C3>
```

## Future Extensions

Planned for future versions:

- Articulation symbols (staccato, legato)
