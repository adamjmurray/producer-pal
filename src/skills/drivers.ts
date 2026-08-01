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
// `basic` still inlines its tail. Small-model mode means FEWER FRAGMENTS plus
// basic notation, not basic variants of all thirteen — the whole document is
// under 800 tokens, so carving it fragment-by-fragment would cost more in
// include lines than it could ever save. What it composes is what a TOOLSET can
// decide: anything inlined here ships to every small-model caller, including the
// narrow-toolset subagent workers gating exists to serve, so a section that maps
// cleanly to one tool — or to one audience — belongs in a fragment however short
// the document is. See `## Rules` below for the other half of that judgment.

const HEADER = "# Producer Pal Skills";

/**
 * Standard-depth driver: the header plus the include manifest. Blank lines
 * between includes are the blank lines between the assembled sections —
 * fragments carry no leading/trailing blank lines, and the resolver collapses
 * any run left behind by a fragment that resolved to nothing (an override the
 * user emptied, `code-transforms` in a release build, or a notation whose head
 * has no authoring half to split off).
 *
 * The notation head takes two adjacent lines so the guide stays contiguous: the
 * base head, then its `-write` sibling carrying the syntax only the clip writers
 * can act on (ADR-0019). Only bar|beat is split so far; the other notations
 * resolve that second ref to nothing.
 */
export const standardDriver = `${HEADER}

@include "./{notation}-standard.md"

@include "./{notation}-standard-write.md"

@include "./time-and-values.md"

@include "./transforms-core.md"

@include "./transforms-editing.md"

@include "./transforms-expressions.md"

@include "./transforms-generative.md"

@include "./code-transforms.md"

@include "./library.md"

@include "./devices.md"

@include "./devices-write.md"

@include "./specialized-devices.md"

@include "./arrangement.md"

@include "./arrangement-write.md"

@include "./working-with-live.md"

@include "./context-standard.md"

@include "./getting-help.md"
`;

/**
 * Small-model driver: header, four includes, and the general Rules inline.
 *
 * The three remaining `## Rules` bullets stay inline as a DECISION, not an
 * oversight: their natural gates are the clip writers, the read tools, and
 * everyone, and each is one line, so a fragment apiece is more include line and
 * more permanent slot name than the text it would save.
 *
 * The audio bullet left, because its axis isn't size. "Say so if asked" is
 * conversation-only — the one thing NO toolset can decide — and inline driver
 * prose survives every gate, so a small-model subagent worker was being told to
 * explain a limitation to nobody. It is `getting-help-basic` now.
 */
export const basicDriver = `${HEADER}

@include "./{notation}-basic.md"

@include "./transforms-basic.md"

@include "./context-basic.md"

## Rules

- Set clip length explicitly: \`4bar\`, \`1bar\`, \`n/4\`.
- Read the set/track/clip to get IDs, indices, scale, and drum map — don't ask the user for what you can look up, and never guess a track.
- If a tool call errors, read the message, fix the arguments, retry — don't claim it's unsupported.

@include "./getting-help-basic.md"
`;
