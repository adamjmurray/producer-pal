// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export const barbeatBasic = `# Producer Pal Skills

## MIDI Notation

Pitches: C0-G8, # or b for sharps/flats (C#3, Bb2). C3 = middle C.
Format: \`v<vel> n<dur> pitch(es) bar|beat\` — always state v and n explicitly (don't rely on defaults); set them *before* the pitches and they persist until you change them.
- v: velocity 0-127 (louder = higher)
- n: duration, and it REQUIRES a denominator: n/4 quarter, n/8 eighth, n/16 sixteenth, n/2 half, n/1 whole, n/12 eighth-triplet. Bare numbers are invalid.
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
\`\`\`

## Add notes to an existing clip (update-clip)

\`notes\` MERGES into the clip: a note at the *same* pitch+start overwrites that note; every other note stays. So to add, just pass the new notes — don't resend the whole clip.

## Delete / clear notes (update-clip preTransforms)

\`preTransforms\` clears or edits notes already in the clip, before any new \`notes\` in the same call:
- \`v0\` — delete all notes
- \`[range]: v0\` — delete notes in a range
- ranges: \`C1\` (one pitch) · \`C1-C5\` (pitch range) · \`3|*\` (all of bar 3) · \`1|1-2|1\` (explicit span, end inclusive)

Replace bar 1's snare, keep the rest:
\`preTransforms: "D1 1|*: v0"\` with \`notes: "v100 n/8 D1 1|2,4"\`

## Rules
- Set clip length explicitly: \`4bar\`, \`1bar\`, \`n/4\`.
- Read the set/track/clip to get IDs, indices, scale, and drum map — don't ask the user for what you can look up, and never guess a track.
- If a tool call errors, read the message, fix the arguments, retry — don't claim it's unsupported.
- Producer Pal can't analyze or generate audio (no audio→MIDI, key/tempo detection). Say so if asked. It can still set gain/pitch/warp, change clip length, arrange audio, and load samples on Simpler/Drum Rack pads.
`;
