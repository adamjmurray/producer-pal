// src/tonelang/tonelang-description.js
export const TONELANG_DESCRIPTION = `<tonelang-specification>
ToneLang is a compact music notation syntax for MIDI sequences.

## Core Elements

- Notes: \`C3\` (middle C), \`F#4\`, \`Bb2\` (pitches from C-2 to G8)
- Chords: \`[C3 E3 G3]\` (notes played simultaneously)
- Rests: \`R\` or \`R2\` (silent duration, default 1 beat)
- Groupings: \`(C3 D3 E3)\` (grouped elements)
- Repetition: \`C3*3\` or \`(C3 D3)*2\` (repeat elements)

## Modifiers (applied in any order)

- Velocity: \`v80\` (0-127, default 70)
- Duration: \`n2\` (in beats, default 1)
- TimeUntilNext: \`t1.5\` (when next element starts, default = duration)

Modifiers work differently depending on the element type:
- \`C3v80\` - Note with velocity 80
- \`[C3 E3]n2\` - Chord with 2-beat duration
- \`(C3 D3)v90\` - Grouping where each contained element inherits velocity 90

## Groupings

Groupings \`(...)\` contain sequences and pass modifiers to inner elements:
- \`(C3 D3)v90\` is equivalent to \`C3v90 D3v90\` - each note inherits the velocity
- \`(C3 D3)t2\` is equivalent to \`C3t2 D3t2\` - affects timing of each contained element
- Groupings do not directly use modifiers themselves - they only distribute them

## Multiple Voices

Use semicolons to create independent voices (think different instruments):
\`C3 D3 E3; G2 A2 B2\` (two parallel melodies)

Particularly useful for drums:
\`C1 C1 C1 C1; R D1 R D1\` (kick on every beat, snare on 2 and 4)

## Examples

- Scale: \`C3 D3 E3 F3 G3 A3 B3 C4\` 
- Chords: \`[C3 E3 G3]v90 [F3 A3 C4]v70n2\`
- Patterns: \`(C3 D3)*2 (E3 F3)*2\`
- Counterpoint: \`C3 D3 E3; G2 A2 B2\`
- Articulation: \`C4n0.5t1 D4n0.5t1\` (staccato notes)
- Drum beat: \`C1 C1 C1 C1; R D1 R D1; F#1n0.5 F#1n0.5 F#1n0.5 F#1n0.5\`
</tonelang-specification>`;
