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

- A character with a space after it = a quarter note; characters run together (no spaces) = 16th notes. \`/\` = next bar, \`.\` = rest, \`-\` = sustain (hold the previous note).
- For eighths or 16ths, write the part as ONE continuous 16th run with NO internal spaces (\`.\` for the gaps): eighths = \`x.x.x.x.x.x.x.x.\`, straight 16ths = \`xxxxxxxxxxxxxxxx\`. A space turns the character before it into a quarter note, so a space inside a subdivided run breaks the timing — never group a fast run with spaces.
- **Fill the whole clip: a 4/4 bar is 4 quarters or 16 sixteenths, and every line must span the same number of bars.**

### Drums

One line per drum, named: \`kick snare snare2 hihat pedal open tom1 tom2 tom3 tom4 ride crash clap rimshot perc1 perc2\`.
Hits: \`X\` = loud, \`x\` = soft, \`^\` = accent.
Example — a 1-bar 4/4 backbeat: kick on 1 & 3, snare on 2 & 4, closed hi-hat on every eighth. Kick/snare are quarters (space-separated); the hi-hat's eighths are one unbroken run:
\`\`\`
kick: X . X .
snare: . X . X
hihat: x.x.x.x.x.x.x.x.
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
