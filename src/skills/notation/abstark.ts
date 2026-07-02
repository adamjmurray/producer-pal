// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Abstark notation head. A literal, round-trippable format. One shared head used
 * at both skill levels (standard and basic) — the format has no simplified
 * variant, so the only standard/basic difference is which core body
 * ({@link coreStandard} / {@link coreBasic}) {@link buildSkills} appends.
 */
export const abstark = `## MIDI Notation — Abstark

A literal, round-trippable format. The \`notes\` argument (and read-clip's returned notes) is one line per part, \`type: content\`:

- **Drums** — one 16th-note step per character (positional grid): \`^\`=accent, \`X\`=normal, \`x\`=soft, \`.\`=rest. **Always write exactly 4 steps per beat as one space-separated group, and pad every line with \`.\` so it spans the full clip** — a 1-bar 4/4 clip is 16 steps = 4 groups of 4 (a 2-bar clip is 8 groups). Whitespace only groups; \`|\` is a visual barline; neither advances time. Example — a 1-bar 4/4 backbeat, kick on beats 1 & 3, snare on 2 & 4, closed hi-hat on every eighth:

\`\`\`
kick:  X... .... X... ....
snare: .... X... .... X...
hihat: X.X. X.X. X.X. X.X.
\`\`\`

Drum names (General MIDI 16-pad layout, notes 36-51): kick snare snare2 hihat pedal open tom1 tom2 tom3 tom4 ride crash clap rimshot perc1 perc2 (toms run high→low; perc1/perc2 are the variable upper pads). A pad with no name uses an absolute pitch-name header instead (\`C3: X...\`, Ableton C3=60) — same content syntax.
- **Pitched** — \`melody: C Eb G'\` (also \`bass:\`, \`chords:\`). Event-based: whitespace has NO rhythmic meaning. A token is letter \`A\`-\`G\` + optional \`#\`/\`b\` (immediately after the letter, so \`Cb\`=C-flat but a lone \`b\`=note B) + octave marks (\`'\` up, \`,\` down, stackable) + duration \`/N\` + dynamic (\`!\`=accent, \`?\`=soft, omit=normal). \`/N\` is an ABSOLUTE note value: \`/1\`=whole (4 beats), \`/2\`=half, \`/4\`=quarter (1 beat), \`/8\`, \`/16\`. Rest = \`z\` or \`z/N\`. Default duration is \`/4\` for bass/melody, \`/1\` for chords; set a line default in the header (\`melody/8: ...\`).
- **Registers** (the MIDI pitch a bare \`C\` maps to, Ableton naming where C3=60=middle C): bass=C1, melody=C3, chords=C2; octave marks shift from there.
- **Chords** — \`chords: [C Eb G]/2!\` the bracket's notes share its \`/N\` duration and dynamic.

\`notes\` MERGES into an existing clip; use \`preTransforms\` to delete or edit notes already in the clip.
`;
