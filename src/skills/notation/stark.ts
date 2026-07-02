// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark notation head. A literal, round-trippable format. Its pitched
 * (bass/melody/chords) syntax is identical to abstark; it differs only in drums,
 * which are event-based (a line of drum hits with /N durations) rather than a
 * positional 16th-note grid. One shared head used at both skill levels (standard
 * and basic) — the only standard/basic difference is which core body
 * ({@link coreStandard} / {@link coreBasic}) {@link buildSkills} appends.
 */
export const stark = `## MIDI Notation — Stark

A literal, round-trippable format. The \`notes\` argument (and read-clip's returned notes) is one line per part, \`type: content\`. Whitespace between tokens is only a separator — it has NO rhythmic meaning; timing comes from each token's duration.

- **Drums** — one line per drum, written like a melody of hits: \`X\`=normal, \`x\`=soft, \`^\`=accent, \`z\`=rest. Each token lasts \`/4\` (a quarter note) by default; set a line default in the header (\`hihat /8:\`) or glue \`/N\` to one token (\`X/8\`). Token count = the familiar subdivision: a 4/4 bar of quarters is 4 tokens, of eighths is 8. \`|\` is an optional visual barline. Example — a 1-bar 4/4 backbeat, kick on 1 & 3, snare on 2 & 4, closed hi-hat on every eighth:

\`\`\`
kick: X z X z
snare: z X z X
hihat /8: X X X X X X X X
\`\`\`

Drum names (General MIDI 16-pad layout, notes 36-51): kick snare snare2 hihat pedal open tom1 tom2 tom3 tom4 ride crash clap rimshot perc1 perc2 (toms run high→low; perc1/perc2 are the variable upper pads). A pad with no name uses an absolute pitch-name header instead (\`C3: X z X z\`, Ableton C3=60) — same content syntax.
- **Pitched** — \`melody: C Eb G'\` (also \`bass:\`, \`chords:\`). A token is letter \`A\`-\`G\` + optional \`#\`/\`b\` (immediately after the letter, so \`Cb\`=C-flat but a lone \`b\`=note B) + octave marks (\`'\` up, \`,\` down, stackable) + duration \`/N\` + dynamic (\`!\`=accent, \`?\`=soft, omit=normal). \`/N\` is an ABSOLUTE note value: \`/1\`=whole (4 beats), \`/2\`=half, \`/4\`=quarter (1 beat), \`/8\`, \`/16\`. Rest = \`z\` or \`z/N\`. Default duration is \`/4\` for bass/melody, \`/1\` for chords; set a line default in the header (\`melody/8: ...\`).
- **Registers** (the MIDI pitch a bare \`C\` maps to, Ableton naming where C3=60=middle C): bass=C1, melody=C3, chords=C2; octave marks shift from there.
- **Chords** — \`chords: [C Eb G]/2!\` the bracket's notes share its \`/N\` duration and dynamic.

\`notes\` MERGES into an existing clip; use \`preTransforms\` to delete or edit notes already in the clip.
`;
