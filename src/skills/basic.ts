// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export const skills = `# Producer Pal Skills

## MIDI Notation

Pitches: C0-G8 with # or b for sharps/flats (C#3, Bb2). C3 = middle C
Format: [v<vel>] [t<dur>] [p<prob>] pitch(es) bar|beat
- v: velocity 0-127 (default 100). t: duration as an absolute note value (default t/4 = quarter). p: probability 0-1 (default 1). Persist until changed
- Durations REQUIRE a denominator: t/4 = quarter, t/8 = eighth, t/16 = sixteenth, t/12 = eighth triplet. t3/8 = dotted quarter. Bare integers or decimals are invalid

### Melody (one quarter note per beat across 2 bars)
\`\`\`
C3 1|1 D3 1|2 E3 1|3 F#3 1|4
G3 2|1 A3 2|2 G#3 2|3 E3 2|4
\`\`\`

### Chords (set duration with t, t/1 = 4 quarters)
\`\`\`
t/1
C3 E3 G3 1|1
D3 F3 A3 2|1
E3 G3 B3 3|1
F3 A3 C4 4|1
\`\`\`

### Drums (commas for multiple beats, {beat}x{count}[@{step}] for repeats)
\`\`\`
C1 1|1,3 2|1,3 3|1,3 4|1,3  # kick
D1 1|2,4 2|2,4 3|2,4 4|2,4  # snare
t/16 Gb1 1|1.5x4@/4 2|1.5x4@/4 3|1.5x4@/4 4|1.5x4@/4  # hats (4 per bar, quarter-note step)
\`\`\`

## Rules
- Set clip lengths explicitly (e.g., 4:0 for 4 bars)
- Positions use | (bar|beat). \`t\` durations and \`@step\` intervals are absolute note values (a quarter is a quarter in any meter)
- If the user references a track, get its trackIndex and id - never guess
`;
