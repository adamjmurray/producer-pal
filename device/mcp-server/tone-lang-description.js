// device/mcp-server/tone-lang-description.js
/**
 * Exports a standardized description of ToneLang syntax for use in tool descriptions
 */
const TONE_LANG_DESCRIPTION = `<tone-lang-specification>
ToneLang is a compact music notation syntax.

Format: pitchClass+octave (C3 = middle C).
Pitch classes: C Db D Eb E F Gb G Ab A Bb B, alternately spelled as C C# D D# E F F# G G# A A# B.
Velocity: :vNN (0–127; default = 100), must be placed before duration.
Durations: quarter note is default, /N means 1/N of a quarter note, *N means N times a quarter note. N can be an integer or decimal.
Duration examples: C3 = quarter note, C3/2 = eighth, C3/4 = sixteenth, C3*2 = half, C3*4 = whole, C3*1.5 = dotted quarter.
Rests: R[optional *N or /N] (default rest duration = quarter rest, just like notes).
Chords: [C3 E3 G3] (group notes played together).
Chord velocity and duration modifiers: [C3 E3 G4:v50/2]:v127*2 = C3 and E3 get chord settings :v127*2 and G4 overrides them.
Multiple voices: Use semicolons to separate independent voices that play simultaneously (e.g., C3 D3 E3; G2 A2 B2).

Examples:
- C3 D3 E3 F3 G3 A3 B3 C4 (C major scale)
- C3:v80 D3:v70 E3:v60 (decreasing velocity)
- C3/2 D3/2 E3/2 F3/2 (sequence of eighth notes)
- C3 R/2 E3 R/2 G3 (notes with eighth rests between)
- [C3 E3 G3] [F3 A3 C4] [G3 B3 D4] (chord progression)
- C3:v80/2 D3/2:v100 [E3 G3]:v90*2 R F3:v120/4 F#3:v80/4 G3:v127/2 (complex pattern)
- C3 D3 E3 F3; G2 A2 B2 C3 (two-voice counterpoint)
</tone-lang-specification>`;

module.exports = { TONE_LANG_DESCRIPTION };
