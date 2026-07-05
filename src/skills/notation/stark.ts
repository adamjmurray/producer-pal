// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark notation heads. A literal, round-trippable format: melody/bass lines are
 * literal pitches, a chords line is chord SYMBOLS, and drums are event-based (a
 * line of drum hits) — all with absolute /N durations.
 *
 * The two variants share a body and differ in two escape hatches the standard
 * head adds and the basic head omits: the absolute drum pitch-name header (`C3:`)
 * for pads outside the 16 named General MIDI drums, and `[..]` bracket voicings.
 * The parser reads both in EVERY mode — the serializer still emits `C3:` headers
 * and bracket stacks — so read-back is unchanged; the basic head only narrows
 * what a small model is TAUGHT to generate (chord symbols + the 16 named pads).
 * The matching core body ({@link coreStandard} / {@link coreBasic}) `@include`s
 * whichever head small-model mode selects — `resolveIncludes` composes them,
 * buildSkills glues nothing.
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

// Pitched lines, registers, and chord symbols (shared by both heads).
const starkHeadPitched = `
- **Pitched** — \`melody: C Eb G'\` (also \`bass:\`). A token is letter \`A\`-\`G\` + optional \`#\`/\`b\` (immediately after the letter, so \`Cb\`=C-flat but a lone \`b\`=note B) + octave marks (\`'\` up, \`,\` down, stackable) + duration \`/N\` + dynamic (\`!\`=accent, \`?\`=soft, omit=normal). \`/N\` is an ABSOLUTE note value: \`/1\`=whole (4 beats), \`/2\`=half, \`/4\`=quarter (1 beat), \`/8\`, \`/16\`. A trailing \`.\` means dotted (×1.5): \`/4.\`=dotted quarter (1.5 beats); a trailing \`t\` means triplet (×2/3): \`/8t\`=eighth-note triplet (⅓ beat, three per beat). One modifier max (\`.\` or \`t\`, not both). Repeat any token with a trailing \`*N\`: \`C*4\`, \`z*3\`. Rest = \`z\` or \`z/N\`. Default duration is \`/4\` for bass/melody, \`/1\` for chords; set a line default in the header (\`melody/8: ...\`).
- **Registers** (the MIDI pitch a bare \`C\` maps to, Ableton naming where C3=60=middle C): bass=C1, melody=C3, chords=C2; octave marks shift from there.
- **Chords** — \`chords: C Am F G7\` one chord SYMBOL per token: root (letter + optional \`#\`/\`b\`, e.g. \`Ebm7\`, \`Bb7\`) + quality. Bare root = major triad; \`m\`=minor (\`Cm\`), then \`maj7 m7 7 dim aug sus2 sus4 6 9 11 13 add9\` and alterations like \`7b9\`/\`7#5\`. Slash bass = \`/\` + a note: \`G7/B\`. Suffixes come AFTER the quality (and after any slash bass) and apply to the whole chord — \`/N\` duration, \`'\`/\`,\` octave, \`!\`/\`?\` dynamic, \`*N\` repeat: \`Cm/2\` (half note), \`Fmaj7'\` (up an octave), \`G7/B/4\` (quarter, over B), \`Am!\` (accent), \`C*4\` (four times). Chord symbols are input-only sugar — read-back returns the literal notes.`;

// Bracket voicings — an advanced escape hatch taught to the standard head only;
// the parser accepts them in every mode, so small models simply aren't shown them.
const starkBracketVoicings = `
- **Voicings** — a \`[C E G]\` bracket is an explicit simultaneous stack sharing one \`/N\` + dynamic: \`melody: [C E G]/2!\`. Separate the notes with SPACES only: inside a bracket \`,\` and \`'\` are octave marks (\`[C, E]\` = C and E each an octave down, still one stack), so write \`[C E G]\`, NEVER \`[C, E, G]\` — commas there would silently drop those notes an octave. Valid on melody/bass (their register) and on a \`chords:\` line (chord register), alongside symbols: \`chords: Cm7 [Eb G C']\`.`;

// The merge note closes both heads. It also refines the "round-trippable" claim:
// pitch/timing/duration are exact, but velocity is quantized to the 3 dynamics.
const starkMergeNote = `

Round-trip preserves pitch, timing, and duration exactly; velocity is the lossy axis — on read-back it snaps to the three dynamics (soft/normal/accent) and is re-randomized within each range, so use bar|beat or midi-json when exact velocities matter.

\`notes\` MERGES into an existing clip; use \`preTransforms\` to delete or edit notes already in the clip.
`;

/**
 * Standard stark head: adds the absolute pitch-name fallback for unnamed pads and
 * the bracket-voicing escape hatch that the basic head omits.
 */
export const starkStandard =
  starkHeadDrums +
  starkDrumPitchNameFallback +
  starkHeadPitched +
  starkBracketVoicings +
  starkMergeNote;

/**
 * Small-model stark head: the 16 named pads and chord symbols only — no absolute
 * pitch-name fallback and no bracket voicings.
 */
export const starkBasic = starkHeadDrums + starkHeadPitched + starkMergeNote;
