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
Element    ::= Repetition | Note | Chord | Rest

Note       ::= Pitch Velocity? Duration? TimeUntilNext? RepetitionMultiplier?
Pitch      ::= PitchClass Octave
PitchClass ::= "C" | "C#" | "Db" | "D" | "D#" | "Eb" | "E" | "F" | "F#" | "Gb" | "G" | "G#" | "Ab" | "A" | "A#" | "Bb" | "B"
Octave     ::= SignedInteger  // -2 to 8 for valid MIDI range
Rest       ::= "R" UnsignedDecimal? RepetitionMultiplier?
Chord      ::= "[" Note (WS Note)* "]" Velocity? Duration? TimeUntilNext? RepetitionMultiplier?

Velocity        ::= "v" Digit Digit? Digit?
Duration        ::= "n" UnsignedDecimal?
TimeUntilNext   ::= "t" UnsignedDecimal?
Repetition      ::= "(" Sequence ")" RepetitionMultiplier?
RepetitionMultiplier ::= "*" UnsignedInteger

SignedDecimal   ::= "-"? UnsignedDecimal
UnsignedDecimal ::= UnsignedInteger ("." UnsignedInteger)? | "." UnsignedInteger
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
- Leading 0 for decimals is optional (e.g. 0.5 == .5)

### Examples

#### Basic Elements

- Note: `C3` (C in octave 3, quarter note)
- Note with modifiers: `E4v80n2` (E in octave 4, velocity 80, half note)
- Chord: `[C3 E3 G3]` (C major triad)
- Chord with modifiers: `[D3 F#3 A3]v90n0.5` (D major triad, velocity 90, eighth note)
- Rest: `R2` (half note rest)
- Repetition: `(C3 D3)*2` (repeat C3 D3 twice)
- Nested repetition: `((C3 D3)*2 E3)*3` (repeat the phrase "C3 D3 C3 D3 E3" three times)

#### Simple Sequence

`C3 D3 E3 F3 G3 A3 B3 C4` (C major scale, quarter notes)

#### Complex Sequence

`C3v90n2 [E3 G3]v70 R0.5 F3v60n0.25 [C4 E4 G4]v100n4`

#### Repetition Examples

`(C3 D3)*4` (repeat C3 D3 four times)

`(C3 [E3 G3])*2 R0.5 (D3 [F3 A3])*2` (repeat C major chord, then D minor chord)

`((C3 D3)*2 E3)*3 F3` (nested repetition followed by F3)

#### Two-Voice Counterpoint

`C3 D3 E3 F3; G2 A2 B2 C3`

#### Three-Voice Pattern with Mixed Rhythms

`C3n2 D3n0.5 E3n0.5; G2n3 A2; [C4 E4 G4]v90n4`

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
- Example: `[C3v100 E3 G3n2]v80n4`
  - C3: velocity=100 (note override), duration=4 (chord level)
  - E3: velocity=80 (chord level), duration=4 (chord level)
  - G3: velocity=80 (chord level), duration=2 (note override)

### Repetition

- Enclose a sequence in parentheses followed by a multiplier
- Format: `(sequence)*N` where N is the number of times to repeat
- Example: `(C3 D3)*2` produces `C3 D3 C3 D3`
- Nesting is supported: `((C3 D3)*2 E3)*3` produces `C3 D3 C3 D3 E3 C3 D3 C3 D3 E3 C3 D3 C3 D3 E3`
- Repetition without a multiplier is valid: `(C3 D3)` is equivalent to just `C3 D3`
- Multiple voices (with semicolons) cannot be used within a repetition
- There are two forms of repetition:
  1. Enclosed sequence repetition: `(sequence)*N` - repeats all elements in parentheses
  2. Single element repetition: `element*N` - repeats a note, chord, or rest
- All types of repetition can be nested:
  - `((C3 D3)*2 E3)*3` - nesting sequence repetitions
  - `(C3*2 D3)*3` - element repetition inside sequence repetition
- Notes and chords can include modifiers before the repetition modifier:
  - `C3v80n2*3` - play C3 with velocity 80 and duration 2 beats, three times
- Examples:
  - `(C3 D3)*2` produces `C3 D3 C3 D3`
  - `C3*2` produces `C3 C3`
  - `[C3 E3 G3]*2` produces two identical C major triads
  - `R1*3` produces three quarter rests
- Notes and chords can include modifiers before the repetition modifier:
  - `C3v80n2*3` - play C3 with velocity 80 and duration 2 beats, three times
  - `[C3 E3 G3]v90*2` - play C major chord with velocity 90, twice
- Nesting is supported for sequence repetition: `((C3 D3)*2 E3)*3`

### Modifiers

Modifiers must be applied in this specific order:

1. **Velocity** (optional): `vNN` format
2. **Duration** (optional): `nN` format
3. **Time Until Next** (optional): `tN` format

### Velocity

- Format: `vNN` where NN is 0-127 (e.g., `v64`)
- Placed immediately after the note or chord, before any duration modifier
- Example: `C3v80` (C3 at velocity 80)
- Example: `[C3 E3 G3]v100` (C major chord at velocity 100)
- Default velocity: 70

### Duration

- Default note duration is a quarter note (1 beat)
- Format: `nN` where N is the duration in quarter notes
  - `C3n2` = half note (2 beats)
  - `C3n1.5` = dotted quarter note (1.5 beats)
  - `C3n4` = whole note (4 beats)
  - `C3n0.5` = eighth note (0.5 beats)
  - `C3n0.25` = sixteenth note (0.25 beats)
  - `C3n0.667` = triplet eighth note (2/3 of a beat)

### Time Until Next

- Format: `tN` where N is the time until the next element starts
- Controls spacing between consecutive notes without needing explicit rests
- When `t < n`: Creates overlapping notes (legato effect)
- When `t = n`: Perfect connection between notes
- When `t > n`: Creates space between notes (staccato effect)
- Default: If omitted, time advances by the note/chord duration
- The `t` modifier is only needed when the time until the next note differs from the note's duration
  - When omitted, the next element will start exactly when the current note/chord ends (timing = duration)
  - For default duration notes (quarter notes), omitting both `n` and `t` uses the most compact syntax

### Rests

- Format: `R` with optional duration value
- Example: `R` (quarter rest)
- Example: `R2` (half rest)
- Example: `R0.25` (sixteenth rest)

## Sequence Syntax

Notes, chords, rests, and repetitions are separated by whitespace to form sequences:

```
C3 D3 E3 F3 G3 A3 B3 C4
```

```
C3v80 D3v60n0.5 R0.5 [E3 G3 B3]v60n2
```

```
(C3 D3)*2 (E3 [G3 B3])*3
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
C3v80 D3v60n0.5 R0.5 [E3 G3 B3]v50n2
```

### Complex Pattern

```
C3v60n2 [E3v90 G3v70] R0.5 F3v120n0.5 R0.5 [D3 F3 A3]v80n4
```

### Chord with Note Overrides

```
[C3v90n2 E3 G3v70n0.5]v80n4
```

### Repetition Examples

```
(C3 D3)*4
```

Creates a sequence of C3 D3 repeated four times.

```
(C3v80 D3)*2 (E3v90 F3)*3
```

Repeats C3v80 D3 twice, then repeats E3v90 F3 three times.

```
((C3 D3)*2 E3)*3 F3
```

Creates a complex nested pattern with C3 D3 C3 D3 E3 repeated three times, followed by F3.

### More Repetition Examples

`C4*3 D4` (C4 repeated three times followed by D4)

`[C3 E3 G3]v80n2*2 D3` (C major chord with velocity 80 and duration 2, repeated twice, followed by D3)

`C4 R0.5*4 D4` (C4, then four sixteenth rests, then D4)

### Examples with TimeUntilNext

```
C4n4t2 D4n4t2 E4n4
```

Creates three 4-beat notes with 2-beat overlaps between consecutive notes.

```
C4n0.5t1 D4n0.5t1 E4n0.5t1
```

Creates staccato eighth notes on a quarter note grid.

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
C3v80 D3 E3 F3v90; G2v100 A2 B2v90 C3
```

Complex rhythmic interaction:

```
C3v60n2 D3v80 E3v70n0.5 F3v80n0.5;
G2v100n4 A2v90n2
```

Voice crossing with different rhythms:

```
C3v80 D3 E3v80 F3v80 G3v80;
G3v90 F3v90 E3v90 D3v90 C3v90
```
