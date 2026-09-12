// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * MIDI JSON notation head. A literal array-of-objects notes format. One shared
 * head used at both skill depths (standard and basic) — the format has no
 * simplified variant, so both drivers' `{notation}-{depth}` include refs are
 * ALIASED onto this one body (see builtin-fragments.ts), and a user's single
 * `midi-json` override applies at both depths.
 *
 * Says nothing about merging into a clip that already has notes: that ships to
 * read-only callers too and is update-clip's alone, so it lives in
 * `transforms-editing`, whose gate is exactly update-clip. The `v:0` marker DOES
 * belong here — it is what the velocity field means, not a way of editing, and
 * omitting it left models guessing (and silently writing velocity-1 notes).
 *
 * The pitch key spells out the octave convention the way the bar|beat heads do.
 * This is the one notation where the MODEL converts a pitch name to a number,
 * so a head that doesn't name and reject the usual C4=60 prior loses that
 * conversion — models wrote 48 for C3.
 */
export const midiJson = `## MIDI Notation — MIDI JSON

The \`notes\` argument (and read-clip's returned notes) is a compact array-of-objects string:

\`[{p:60,t:0,d:4,v:100},{p:62,t:1,d:1,v:90,vd:10,c:0.75}]\`

Keys: \`p\` pitch 0-127 (C3 = middle C = MIDI 60, Ableton numbering; most other software calls this note C4), \`t\` start and \`d\` duration in musical beats, \`v\` velocity 1-127, optional \`vd\` velocity-deviation 0-127 (default 0) and \`c\` probability/chance 0-1 (default 1) — omit \`vd\`/\`c\` at their defaults.

- \`t\` and \`d\` are absolute musical beats (a quarter = 1 beat in x/4): \`t:0\` is clip start, \`t:4\` is beat 5. Chords share a \`t\`.
- \`v:0\` deletes instead of adding: it removes the note at that same \`p\`+\`t\` (already in the clip, or written earlier in this same array) and writes nothing. It applies to that one object only.
- For exact tuplets, write \`t\`/\`d\` as a fraction: \`d:2/3\` (triplet quarter), \`d:1/3\` (triplet eighth) — read-back returns the fraction rather than a lossy \`0.3333\`.`;
