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

Note       ::= Pitch Velocity? Duration? TimeUntilNext?
Pitch      ::= PitchClass Octave
PitchClass ::= "C" | "C#" | "Db" | "D" | "D#" | "Eb" | "E" | "F" | "F#" | "Gb" | "G" | "G#" | "Ab" | "A" | "A#" | "Bb" | "B"
Octave     ::= SignedInteger  // -2 to 8 for valid MIDI range

Chord      ::= "[" Note (WS Note)* "]" Velocity? Duration? TimeUntilNext?

Velocity      ::= "v" Digit Digit? Digit?
Duration      ::= "n" UnsignedDecimal?
TimeUntilNext ::= "t" UnsignedDecimal?
Rest          ::= "R" UnsignedDecimal?

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
- Default = 1 quarter note
- nN = N quarter notes (e.g., n2 = half note, n0.25 = sixteenth note)
- Decimal values supported (e.g., n1.5 = dotted quarter note)

TimeUntilNext:
- format: tN (controlling when the next note starts)
- Allows for articulation control without explicit rests
- When t<n: notes overlap (legato connection)
- When t=n: notes connect perfectly
- When t>n: creates space between notes (staccato effect)
- The \`t\` modifier is only needed when the time until the next note differs from the note's duration
  - When omitted, the next element will start exactly when the current note/chord ends (timing = duration)
  - For default duration notes (quarter notes), omitting both \`n\` and \`t\` uses the most compact syntax

Rests: R with optional duration in quarter notes (e.g., R, R1, R2, R0.25, R.5)

Chords: 
- Basic example: [C3 E3 G3] (notes played together)
- Individual notes in chords can have their own velocity and duration modifiers that override chord-level settings
  - Example: [C3v90 E3 G3n2]v80n4 (C3 uses v90 but n4, E3 uses v80 and n4, G3 uses v80 but n2)

Multiple voices: Use semicolons to separate independent voices (e.g., C3 D3 E3; G2 A2 B2)

Examples:
- C3 D3 E3 F3 G3 A3 B3 C4 (C major scale)
- C3v80 D3v70 E3v60 (decreasing velocity)
- C3n0.5 D3n0.5 E3n0.5 F3n0.5 (sequence of eighth notes)
- [C3 E3 G3]v90 [F3 A3 C4]v70n2 (chord progression with velocities)
- C3 D3 E3 F3; G2 A2 B2 C3 (two-voice counterpoint)
- C4n4t2 D4n4t2 E4n4 (overlapping whole notes, each starting 2 beats after previous)
- C4n0.5t1 D4n0.5t1 E4n0.5t1 (staccato eighth notes on quarter note grid)
</tone-lang-specification>`;
