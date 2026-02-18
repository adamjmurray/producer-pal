// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

export const skills = `# Producer Pal Skills

## MIDI Notation

Pitches: C0-G8 with # or b (C3 = middle C)
Format: pitch(es) bar|beat

### Melody (one note per beat across 2 bars)
\`\`\`
C3 1|1 D3 1|2 E3 1|3 F3 1|4
G3 2|1 A3 2|2 G3 2|3 E3 2|4
\`\`\`

### Chords (set duration with t, t4 = 4 beats = full bar in 4/4)
\`\`\`
t4
C3 E3 G3 1|1
D3 F3 A3 2|1
E3 G3 B3 3|1
F3 A3 C4 4|1
\`\`\`

### Drums (use commas for multiple beats, repeat bar|beats for each bar)
\`\`\`
C1 1|1,3 2|1,3 3|1,3 4|1,3                          # kick
D1 1|2,4 2|2,4 3|2,4 4|2,4                          # snare
Gb1 1|1.5,2.5,3.5,4.5 2|1.5,2.5,3.5,4.5            # hats on off-beats
\`\`\`

## Rules
- Use only the notation features shown in the examples above
- Set clip lengths explicitly (e.g., 4:0 for 4 bars)
- Positions use | (bar|beat). Durations use : (bar:beat) or plain beats (4, 2.5)
- If the user references a track, get its trackIndex and id - never guess
`;
