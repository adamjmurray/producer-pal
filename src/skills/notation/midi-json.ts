// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * MIDI JSON notation head. A literal array-of-objects notes format. One shared
 * head used at both skill levels (standard and basic) — the format has no
 * simplified variant, so the only standard/basic difference is which core body
 * ({@link coreStandard} / {@link coreBasic}) {@link buildSkills} appends.
 */
export const midiJson = `## MIDI Notation — MIDI JSON

The \`notes\` argument (and read-clip's returned notes) is a compact array-of-objects string:

\`[{p:60,t:0,d:4,v:100},{p:62,t:1,d:1,v:90,vd:10,c:0.75}]\`

Keys: \`p\` pitch 0-127 (C3=60, middle C), \`t\` start and \`d\` duration in musical beats, \`v\` velocity 1-127, optional \`vd\` velocity-deviation 0-127 (default 0) and \`c\` probability/chance 0-1 (default 1) — omit \`vd\`/\`c\` at their defaults.

- \`t\` and \`d\` are absolute musical beats (a quarter = 1 beat in x/4): \`t:0\` is clip start, \`t:4\` is beat 5. Chords share a \`t\`.
- For exact tuplets, write \`t\`/\`d\` as a fraction: \`d:2/3\` (triplet quarter), \`d:1/3\` (triplet eighth) — read-back returns the fraction rather than a lossy \`0.3333\`.
- MIDI JSON has no \`v0\`-delete — use \`preTransforms\` to delete or edit existing notes.
- \`notes\` MERGES into an existing clip: a note at the *same* pitch+start overwrites that note; others are untouched. Restate just the notes you're changing — don't resend the whole clip.
`;
