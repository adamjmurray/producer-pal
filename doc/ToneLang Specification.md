# ToneLang Specification

_A minimal, human- and LLM-friendly music notation for sequencing and MIDI._

## Overview

ToneLang is a compact, readable text syntax for musical sequences that maps cleanly to MIDI/DAW environments. It
supports notes, chords, rests, repetitions, and fine-grained control over dynamics and timing with a straightforward
syntax that is both human- and LLM-friendly.

## Core Concepts

### Notes and Modifiers

Each individual note supports three optional modifiers:

- **Velocity**: `vNN` (0–127, default: 70)
- **Duration**: `nN` (in quarter note units, default: 1.0)
- **Time Until Next**: `tN` (controls spacing to the next element, default: equals duration)

Example: `C3v80n2t3`

### Modifier Inheritance

If a modifier is missing on a note, it is inherited from the nearest enclosing container in the following order of
precedence:

1. Note (explicit)
2. Chord (if inside one)
3. Grouping (if inside one)
4. Global defaults

### Time Behavior

- The `t` modifier controls when the **next element** in a sequence begins.
- Duration (`n`) affects how long a note is held but not the time cursor.
- If `t` is omitted, the time cursor advances by `n` (default behavior).

### Chords

A chord is a list of notes enclosed in square brackets `[...]`. All notes in a chord begin simultaneously.

- A chord can carry modifiers (`v`, `n`, `t`) that apply to all child notes as fallback values.
- If `** is not specified on the chord**, the time cursor advances by the **maximum **`\*\* of its child notes\*\*.
- If **conflicting **\`\`** values exist inside a chord**, and no chord-level `t` is given, the time cursor advances by
  the maximum `t` value among the child notes.
- If the chord specifies its own `t`, it overrides all note `t` values **for cursor advancement only**.

### Groupings

Groupings are enclosed in parentheses `(...)` and can contain sequences.

- Modifiers on groupings (e.g., `v`, `n`, `t`) are not applied to the grouping itself, but instead serve as defaults for
  any inner notes or chords that don’t specify their own modifiers.
- A grouping’s duration and spacing are determined entirely by the cumulative effect of its inner elements after
  modifier inheritance.
- A grouping can be followed by a repetition modifier: `*N`.

### Repetition

Any note, chord, rest, or grouping can be followed by `*N` to repeat it N times.

- `(C3 D3)*2` duplicates the entire group: `C3 D3 C3 D3`
- `C3*3` duplicates the note: `C3 C3 C3`
- Nesting is supported: `((C3 D3)*2 E3)*3`

## Syntax Summary

```
Top         ::= Sequence (";" Sequence)*
Sequence    ::= Element (WS Element)*
Element     ::= Note | Chord | Grouping | Rest
Note        ::= Pitch Modifiers?
Chord       ::= "[" Note (WS Note)* "]" Modifiers?
Grouping    ::= "(" Sequence ")" Modifiers? Repetition?
Rest        ::= "R" UnsignedDecimal? Repetition?
Repetition  ::= "*" UnsignedInteger
Modifiers   ::= (Velocity | Duration | TimeUntilNext)*
Pitch       ::= PitchClass Octave
PitchClass  ::= A | A# | Bb | B | C | C# | Db | D | D# | Eb | E | F | F# | Gb | G | G# | Ab
Octave      ::= Integer (range: -2 to 8)
Velocity    ::= "v" 0-127
Duration    ::= "n" Decimal
TimeUntilNext ::= "t" Decimal
```

## Examples

### Notes

- `C3` — quarter note, velocity 70
- `D4v90n2t3` — half note, velocity 90, next event starts 3 beats later

### Chords

- `[C3 E3 G3]` — basic chord
- `[C3v100 E3 G3n2]v80n4` — mix of chord- and note-level modifiers

### Groupings

- `(C3 D3)v90` — both notes inherit `v90`
- `((C3 D3)*2 E3)*3` — nested repetitions

### Rests

- `R` — quarter rest
- `R0.5*4` — four sixteenth rests

### Sequences

- `C3 D3 E3 F3 G3 A3 B3 C4`
- `C3v90 D3v80n0.5 R0.5 [E3 G3 B3]v60n2`

### Multi-Voice

- `C3 D3 E3; G2 A2 B2`

## Validation Rules

- Modifiers may appear in any order.
- Duplicate modifiers on the same element are invalid.
- Groupings do not affect timeline progression directly.
- Chords affect timeline only through `t` at the chord level or inferred from children.
