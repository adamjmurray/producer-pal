// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark notation heads. A literal, round-trippable format: pitched
 * (bass/melody/chords) lines use explicit pitch + absolute /N durations, and
 * drums are event-based (a line of drum hits with /N durations).
 *
 * Two variants share one body and differ only in the drum pitch-name fallback.
 * {@link starkStandard} teaches the absolute pitch-name header (`C3:`) for pads
 * outside the 16 named General MIDI drums; {@link starkBasic} (small-model mode)
 * omits it so small models only ever author the 16 named pads. The serializer
 * still emits, and the parser still reads, `C3:` headers — so read-back of an
 * exotic pad is unchanged; this only narrows what a small model is taught to
 * generate. The matching core body ({@link coreStandard} / {@link coreBasic}) is
 * appended by {@link buildSkills}.
 */

// Preamble + the drum line, through the 16 named pads (shared by both heads).
const starkHeadDrums = `## MIDI Notation — Stark

A literal, round-trippable format. The \`notes\` argument (and read-clip's returned notes) is one line per part, \`type: content\`. Whitespace between tokens is only a separator — it has NO rhythmic meaning; timing comes from each token's duration.

- **Drums** — one line per drum, written like a melody of hits: \`X\`=normal, \`x\`=soft, \`^\`=accent, \`z\`=rest. Each token lasts \`/4\` (a quarter note) by default; set a line default in the header (\`hihat /8:\`) or glue \`/N\` to one token (\`X/8\`). Repeat a token with \`*N\`: \`hihat /16: X*16\` is a one-bar 16th-note roll. Token count = the familiar subdivision: a 4/4 bar of quarters is 4 tokens, of eighths is 8. \`|\` is an optional visual barline. Example — a 1-bar 4/4 backbeat, kick on 1 & 3, snare on 2 & 4, closed hi-hat on every eighth:

\`\`\`
kick: X z X z
snare: z X z X
hihat /8: X X X X X X X X
\`\`\`

Drum names (General MIDI 16-pad layout, notes 36-51): kick snare snare2 hihat pedal open tom1 tom2 tom3 tom4 ride crash clap rimshot perc1 perc2 (toms run high→low; perc1/perc2 are the variable upper pads).`;

// Standard-only clause: how to address a pad outside the 16 named drums.
const starkDrumPitchNameFallback = ` A pad with no name uses an absolute pitch-name header instead (\`C3: X z X z\`, Ableton C3=60) — same content syntax.`;

// Pitched lines, registers, chords, and the merge note (shared by both heads).
const starkHeadPitched = `
- **Pitched** — \`melody: C Eb G'\` (also \`bass:\`, \`chords:\`). A token is letter \`A\`-\`G\` + optional \`#\`/\`b\` (immediately after the letter, so \`Cb\`=C-flat but a lone \`b\`=note B) + octave marks (\`'\` up, \`,\` down, stackable) + duration \`/N\` + dynamic (\`!\`=accent, \`?\`=soft, omit=normal). \`/N\` is an ABSOLUTE note value: \`/1\`=whole (4 beats), \`/2\`=half, \`/4\`=quarter (1 beat), \`/8\`, \`/16\`. A trailing dot means dotted (×1.5): \`/4.\`=dotted quarter (1.5 beats); one dot max. Repeat any token with a trailing \`*N\`: \`C*4\`, \`[C E G]*2\`, \`z*3\`. Rest = \`z\` or \`z/N\`. Default duration is \`/4\` for bass/melody, \`/1\` for chords; set a line default in the header (\`melody/8: ...\`).
- **Registers** (the MIDI pitch a bare \`C\` maps to, Ableton naming where C3=60=middle C): bass=C1, melody=C3, chords=C2; octave marks shift from there.
- **Chords** — \`chords: [C Eb G]/2!\` the bracket's notes share its \`/N\` duration and dynamic.

\`notes\` MERGES into an existing clip; use \`preTransforms\` to delete or edit notes already in the clip.
`;

/** Standard stark head: includes the absolute pitch-name fallback for unnamed pads. */
export const starkStandard =
  starkHeadDrums + starkDrumPitchNameFallback + starkHeadPitched;

/** Small-model stark head: the 16 named pads only, no absolute pitch-name fallback. */
export const starkBasic = starkHeadDrums + starkHeadPitched;
