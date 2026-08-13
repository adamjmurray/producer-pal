// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark notation heads. A literal, round-trippable format: melody/bass lines are
 * literal pitches, a chords line is chord SYMBOLS, and drums are event-based (a
 * line of drum hits) — all with absolute /N durations.
 *
 * Two axes cross here. DEPTH: the standard head adds two escape hatches the basic
 * head omits — the absolute drum pitch-name header (`C3:`) for pads outside the 16
 * named General MIDI drums, and `[..]` bracket voicings. The parser reads both in
 * EVERY mode, so read-back is unchanged; the basic head only narrows what a small
 * model is TAUGHT to generate. DIRECTION: chord symbols are the one thing here the
 * serializer never emits, so they split off into a `-write` sibling at both depths
 * and a read-only caller stops paying for them (ADR-0019).
 *
 * The matching driver (`standard` / `basic`) `@include`s the head and its `-write`
 * sibling on adjacent lines — `resolveIncludes` composes them, buildSkills glues
 * nothing.
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

// Pitched lines and registers (shared by both heads). Absolute octaves (`C3`)
// parse on note tokens but are deliberately NOT taught here — models write them
// unprompted, and the Skills teach one spelling. See ADR-0018.
//
// Both bullets still name `chords:` (its default duration, its register) though
// the chord SYMBOLS moved to the write half. That is the whole-bullet seam doing
// its job: a read-back never carries a chords line, but trimming two clauses out
// of the middle of a shared bullet is the mis-sort ADR-0019 rejected, and the
// cost is a few tokens.
const starkHeadPitched = `
- **Pitched** — \`melody: C Eb G'\` (also \`bass:\`). A token is letter \`A\`-\`G\` + optional \`#\`/\`b\` (immediately after the letter, so \`Cb\`=C-flat but a lone \`b\`=note B) + octave marks (\`'\` up, \`,\` down, stackable) + duration \`/N\` + dynamic (\`!\`=accent, \`?\`=soft, omit=normal). \`/N\` is an ABSOLUTE note value: \`/1\`=whole (4 beats), \`/2\`=half, \`/4\`=quarter (1 beat), \`/8\`, \`/16\`. A trailing \`.\` means dotted (×1.5): \`/4.\`=dotted quarter (1.5 beats); a trailing \`t\` means triplet (×2/3): \`/8t\`=eighth-note triplet (⅓ beat, three per beat). One modifier max (\`.\` or \`t\`, not both). Repeat any token with a trailing \`*N\`: \`C*4\`, \`z*3\`. Rest = \`z\` or \`z/N\`. Default duration is \`/4\` for bass/melody, \`/1\` for chords; set a line default in the header (\`melody/8: ...\`).
- **Registers** (the MIDI pitch a bare \`C\` maps to, Ableton naming where C3=60=middle C): bass=C1, melody=C3, chords=C2; octave marks shift from there.`;

// Bracket voicings — an advanced escape hatch taught to the standard head only;
// the parser accepts them in every mode, so small models simply aren't shown them.
// The serializer emits them on melody/bass, which is why they stay on the read
// side. Their use on a `chords:` line is restated in the write half, because the
// example there names a chord symbol a read-only caller was never taught.
const starkBracketVoicings = `
- **Voicings** — a \`[C E G]\` bracket is an explicit simultaneous stack sharing one \`/N\` + dynamic: \`melody: [C E G]/2!\`. Separate the notes with SPACES only: inside a bracket \`,\` and \`'\` are octave marks (\`[C, E]\` = C and E each an octave down, still one stack), so write \`[C E G]\`, NEVER \`[C, E, G]\` — commas there would silently drop those notes an octave. Valid on melody/bass, in their register.`;

// Closes both heads by refining the "round-trippable" claim: pitch/timing/
// duration are exact, but velocity is quantized to the 3 dynamics.
//
// The merge rule used to close this too. It moved to `transforms-editing`
// (update-clip's gate): this head ships to read-only callers, who have nothing
// to merge, and it pointed at a `preTransforms` those callers were never taught.
const starkRoundTripNote = `

Round-trip preserves pitch, timing, and duration exactly; velocity is the lossy axis — on read-back it snaps to the three dynamics (soft/normal/accent) and is re-randomized within each range, so use bar|beat or midi-json when exact velocities matter.`;

// The authoring half, shared by both depths: chord symbols and nothing else. The
// serializer realizes every symbol to literal pitches and never emits a `chords:`
// line at all, so a read-back provably contains none of this.
const starkChords = `## Writing Notes

- **Chords** — \`chords: C Am F G7\` one chord SYMBOL per token: root (letter + optional \`#\`/\`b\`, e.g. \`Ebm7\`, \`Bb7\`) + quality. Bare root = major triad; \`m\`=minor (\`Cm\`), then \`maj7 m7 7 dim aug sus2 sus4 6 9 11 13 add9\` and alterations like \`7b9\`/\`7#5\`. Slash bass = \`/\` + a note: \`G7/B\`. Suffixes come AFTER the quality (and after any slash bass) and apply to the whole chord — \`/N\` duration, \`'\`/\`,\` octave, \`!\`/\`?\` dynamic, \`*N\` repeat: \`Cm/2\` (half note), \`Fmaj7'\` (up an octave), \`G7/B/4\` (quarter, over B), \`Am!\` (accent), \`C*4\` (four times). Chord symbols are input-only sugar — read-back returns the literal notes.`;

// Standard-only: the chords-line use of a voicing, restated here because the read
// half's Voicings bullet now stops at melody/bass. Its example mixes a symbol with
// a bracket, so it only makes sense once symbols have been taught.
const starkChordVoicings = `
- A \`[..]\` **voicing** works on a \`chords:\` line too, in the chord register, alongside symbols: \`chords: Cm7 [Eb G C']\`.`;

/**
 * Standard stark head: adds the absolute pitch-name fallback for unnamed pads and
 * the bracket-voicing escape hatch that the basic head omits.
 */
export const starkStandard =
  starkHeadDrums +
  starkDrumPitchNameFallback +
  starkHeadPitched +
  starkBracketVoicings +
  starkRoundTripNote;

/**
 * Standard stark authoring half: chord symbols, plus their use inside a bracket
 * voicing. Gated on the two clip writers.
 */
export const starkStandardWrite = starkChords + starkChordVoicings;

/**
 * Small-model stark head: the 16 named pads only — no absolute pitch-name
 * fallback and no bracket voicings.
 */
export const starkBasic =
  starkHeadDrums + starkHeadPitched + starkRoundTripNote;

/**
 * Small-model stark authoring half: chord symbols alone. No voicings clause —
 * the basic head never taught brackets.
 */
export const starkBasicWrite = starkChords;
