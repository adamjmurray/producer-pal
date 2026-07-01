// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark notation head. An ultra-minimal format for small/weak LLMs. One shared
 * head used at both skill levels (standard and basic) — the format has no
 * richer variant, so the only standard/basic difference is which core body
 * ({@link coreStandard} / {@link coreBasic}) {@link buildSkills} appends.
 */
export const stark = `## MIDI Notation — Stark

An ultra-minimal format. One line per part, written as \`type: content\`.

### Timing (one rule)

- Tokens separated by a space = quarter notes.
- Tokens with NO space between them = 16th notes.
- \`/\` starts the next bar. \`.\` = rest. \`-\` = sustain (hold the previous note).

### Drums

One line per drum, named: \`kick snare snare2 hihat pedal open tom1 tom2 tom3 tom4 ride crash clap rimshot perc1 perc2\`.
Hits: \`X\` = loud, \`x\` = soft, \`^\` = accent.
\`\`\`
kick: X . X .
snare: . X . X
hihat: xxxx xxxx
\`\`\`

### Bass / Melody

\`bass:\` (low register) or \`melody:\` (higher register). Note letters \`A\`-\`G\`
auto-snap to the scale (default C Major) — no sharps/flats, no octave numbers;
each note picks the octave closest to the previous one. Uppercase = loud,
lowercase = soft.
\`\`\`
bass: C E G C / C D E F
melody: E G A / A G E
\`\`\`

### Chords

\`chords:\` builds a triad per letter; quality comes from the scale degree
(in C Major: C/F/G major, D/E/A minor, B diminished). Add \`7\` for a 7th chord.
\`\`\`
chords: C F G C
chords: C7 D7 G7 C
\`\`\``;
