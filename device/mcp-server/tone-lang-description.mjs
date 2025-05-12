// device/mcp-server/tone-lang-description.mjs
/**
 * Exports a standardized description of ToneLang syntax for use in tool descriptions
 */
export const TONE_LANG_DESCRIPTION = `<tone-lang-specification>
ToneLang is a compact music notation syntax.

## Formal Syntax

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

Velocity   ::= "v" Digit Digit? Digit?

Duration   ::= Multiplier | Divider
Multiplier ::= "*" UnsignedDecimal
Divider    ::= "/" UnsignedDecimal

## Constraints 

- Octave can range from -2 to 8
  - The lowest note is C-2 (MIDI pitch 0) and the highest is G8 (MIDI pitch 127). Invalid pitches throw errors.
- Velocity ranges from 0 to 127 (default: 70)
- Default duration is 1 quarter note

## Notation Guide

Format: pitchClass+octave (C3 = middle C, C-2 = lowest pitch, G8 = highest pitch).
Pitch classes: C, Db/C#, D, Eb/D#, E, F, Gb/F#, G, Ab/G#, A, Bb/A#, B

Velocity: 
- format: vNN (0-127; default = 70)

Durations: 
- Default = quarter note
- /N = 1/N of a quarter note (e.g., /2 = eighth note, /4 = sixteenth note)
- *N = N times a quarter note (e.g., *2 = half note, *4 = whole note)
- Decimal values supported (e.g., *1.5 = dotted quarter note)

Rests: R with optional absolute duration (e.g., R, R1, R2, R0.25, R.5)

Chords: 
- Basic example: [C3 E3 G3] (notes played together)
- Individual notes in chords can have their own velocity and duration modifiers that override chord-level settings
  - Example: [C3v90 E3 G3*2]v80*4 (C3 uses v90 but *4, E3 uses v80 and *4, G3 uses v80 but *2)

Multiple voices: Use semicolons to separate independent voices (e.g., C3 D3 E3; G2 A2 B2)

Examples:
- C3 D3 E3 F3 G3 A3 B3 C4 (C major scale)
- C3v80 D3v70 E3v60 (decreasing velocity)
- C3/2 D3/2 E3/2 F3/2 (sequence of eighth notes)
- [C3 E3 G3]v90 [F3 A3 C4]v70*2 (chord progression with velocities)
- C3 D3 E3 F3; G2 A2 B2 C3 (two-voice counterpoint)
</tone-lang-specification>`;
