// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The two driver roots — the documents `buildSkills` resolves from, chosen by
// small-model mode. A driver is the ONLY place arbitrary top-level prose lives;
// everything else is a fragment it pulls in with `@include`. They sit here
// rather than in fragments/ because they are the graph's roots, not sections of
// it (and fragments/ is at its 12-item folder cap — the next fragment added
// there needs a subfolder).
//
// `standard` is now a bare manifest: header + one include per fragment, in
// reading order. That is the point of the task-line carve — dropping a section
// is deleting one line of a ~15-line document, not forking 1,275 tokens of prose
// you then have to maintain. Every include here is DEPTH-1: the fragments it
// names contain no includes of their own (the resolver refuses nesting), so a
// fragment's cost is exactly its own length.
//
// `basic` still inlines its body. Small-model mode means FEWER FRAGMENTS plus
// basic notation, not basic variants of all thirteen — the whole document is
// under 800 tokens, so carving it would cost more in include lines than it could
// ever save.

const HEADER = "# Producer Pal Skills";

/**
 * Standard-depth driver: the header plus the include manifest. Blank lines
 * between includes are the blank lines between the assembled sections —
 * fragments carry no leading/trailing blank lines, and the resolver collapses
 * any run left behind by a fragment that resolved to nothing (an override the
 * user emptied, or `code-transforms` in a release build).
 */
export const standardDriver = `${HEADER}

@include "./{notation}-standard.md"

@include "./time-and-values.md"

@include "./transforms-core.md"

@include "./transforms-expressions.md"

@include "./transforms-generative.md"

@include "./code-transforms.md"

@include "./library.md"

@include "./devices.md"

@include "./specialized-devices.md"

@include "./arrangement.md"

@include "./working-with-live.md"

@include "./context-standard.md"

@include "./getting-help.md"
`;

/**
 * Small-model driver: header, the basic notation head, and a terse inline body —
 * the shared tail (notes-merge, preTransforms clearing, the general Rules) that
 * every small-model task needs. Context is the one carved-out fragment, so it
 * can be dropped or overridden on its own.
 */
export const basicDriver = `${HEADER}

@include "./{notation}-basic.md"

## Add notes to an existing clip (update-clip)

\`notes\` MERGES into the clip: a note at the *same* pitch+start overwrites that note; every other note stays. So to add, just pass the new notes — don't resend the whole clip.

## Delete / clear notes (update-clip preTransforms)

\`preTransforms\` clears or edits notes already in the clip, before any new \`notes\` in the same call:
- \`v0\` — delete all notes
- \`[range]: v0\` — delete notes in a range
- ranges: \`C1\` (one pitch) · \`C1-C5\` (pitch range) · \`3|*\` (all of bar 3) · \`1|1-2|1\` (explicit span, end inclusive)

@include "./context-basic.md"

## Rules

- Set clip length explicitly: \`4bar\`, \`1bar\`, \`n/4\`.
- Read the set/track/clip to get IDs, indices, scale, and drum map — don't ask the user for what you can look up, and never guess a track.
- If a tool call errors, read the message, fix the arguments, retry — don't claim it's unsupported.
- Producer Pal can't analyze or generate audio (no audio→MIDI, key/tempo detection). Say so if asked. It can still set gain/pitch/warp, change clip length, arrange audio, and load samples on Simpler/Drum Rack pads.
`;
