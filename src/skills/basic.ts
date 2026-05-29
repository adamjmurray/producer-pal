// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export const skills = `# Producer Pal Skills

## MIDI Notation

Pitches: C0-G8 with # or b for sharps/flats (C#3, Bb2). C3 = middle C
Format: [v<vel>] [n<dur>] [p<prob>] pitch(es) bar|beat
- v: velocity 0-127 (default 100). n: duration as an absolute note value (default n/4 = quarter). p: probability 0-1 (default 1). Persist until changed
- Durations REQUIRE a denominator: n/4 = quarter, n/8 = eighth, n/16 = sixteenth, n/12 = eighth triplet. n3/8 = dotted quarter. Bare integers or decimals are invalid

### Melody (one quarter note per beat across 2 bars)
\`\`\`
C3 1|1 D3 1|2 E3 1|3 F#3 1|4
G3 2|1 A3 2|2 G#3 2|3 E3 2|4
\`\`\`

### Chords (set duration with n, n/1 = 4 quarters)
\`\`\`
n/1
C3 E3 G3 1|1
D3 F3 A3 2|1
E3 G3 B3 3|1
F3 A3 C4 4|1
\`\`\`

### Drums (commas for multiple beats, {beat}x{count}[@{step}] for repeats)
\`\`\`
C1 1|1,3 2|1,3 3|1,3 4|1,3  # kick
D1 1|2,4 2|2,4 3|2,4 4|2,4  # snare
n/16 Gb1 1|1.5x4@/4 2|1.5x4@/4 3|1.5x4@/4 4|1.5x4@/4  # hats (4 per bar, quarter-note step)
\`\`\`

## Editing existing notes: preTransforms (update-clip)

\`preTransforms\` edits notes already in the clip BEFORE your new \`notes\` are added (requires \`notes\`). Same v/n/p/pitch tokens as above, with an optional range:
- \`[range]: <change>\` — omit the range to affect all notes
- changes: \`v0\` delete · \`v1-127\` set velocity · \`n/4\` set duration · \`p0-1\` set probability · \`C4\` move notes to a pitch (drum-lane remap)
- range: \`C1\` or \`C1-C5\` (pitch), \`1|1-2|1\` (bar|beat time span)
- clear a region: \`1|1-2|1: v0\` · clear everything: \`v0\`

Here a bar|beat range SELECTS existing notes (a filter); in \`notes\` a bar|beat PLACES a note.

Example — swap bar 1's snare, keep everything else:
\`preTransforms: "E1 1|1-2|1: v0"\` (clear old snares) with \`notes: "E1 1|2,4"\` (new snares)

## Rules
- Set clip lengths explicitly: \`4bar\` for 4 bars, \`n/4\` for a quarter, \`1bar+n/4\` for mixed
- Positions use | (bar|beat). \`n\` durations, \`@step\` intervals, and clip \`length\` fractions are absolute note values (a quarter is a quarter in any meter)
- If the user references a track, get its trackIndex and id - never guess
`;
