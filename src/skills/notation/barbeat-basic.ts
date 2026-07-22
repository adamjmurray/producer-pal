// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * bar|beat basic (small-model) notation head. Just the bar|beat notes syntax;
 * the shared tail (notes-merge, preTransforms, Rules) lives in {@link coreBasic},
 * which `@include`s this head — `resolveIncludes` composes them, not buildSkills.
 */
export const barbeatBasic = `## MIDI Notation

Pitches: C0-G8, # or b for sharps/flats (C#3, Bb2). C3 = middle C.
Format: \`v<vel> n<dur> pitch(es) bar|beat\` — always state v and n explicitly (don't rely on defaults); set them *before* the pitches and they persist until you change them.
- v: velocity 0-127 (louder = higher)
- n: duration, and it REQUIRES a denominator: n/4 quarter, n/8 eighth, n/16 sixteenth, n/2 half, n/1 whole, n/12 eighth-triplet. Add \`d\` for dotted or \`t\` for triplet: n/4d = dotted quarter (= n3/8), n/8t = eighth triplet (= n/12). Bare numbers are invalid.
- bar|beat positions are 1-indexed and read left-to-right: \`4|2\` = bar 4 beat 2. One note per bar → step the LEFT number (\`1|1 2|1 3|1 4|1\`); move within a bar → step the right (\`1|1 1|2 1|3 1|4\`). A decimal lands inside a beat: \`1|1.5\` = the "&".

## Generate notes

Melody (a quarter note per beat):
\`\`\`
v100 n/4 C3 1|1 D3 1|2 E3 1|3 F#3 1|4
G3 2|1 A3 2|2 G#3 2|3 E3 2|4
\`\`\`

Chords (multiple pitches share one position; n/1 = a whole bar):
\`\`\`
v100 n/1 C3 E3 G3 1|1  D3 F3 A3 2|1
\`\`\`

Drums (commas list beats for one pitch; re-set n per lane so it doesn't carry over):
\`\`\`
v100 n/8 C1 1|1,3          # kick
v100 D1 1|2,4              # snare
v80 n/16 Gb1 1|1.5,2.5,3.5,4.5   # hats (softer, on the offbeats)
\`\`\``;
