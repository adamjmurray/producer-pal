// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What an arrangement position MEANS, whichever direction it travels. Gated by
// every clip tool that reports or sets one — read-clip included, because it
// returns `arrangementStart` beside the clip's own `start`/`length` and nothing
// else tells a reader those resolve against different meters.
//
// The note moved here from time-and-values, which is gated "always": the params
// it names belong to exactly this fragment's four tools, so on an "always" gate
// every other caller paid for it.
//
// This fragment owns the `## Arrangement` heading; `arrangementWrite` below
// hangs off it as `###` sections, so the standard driver's manifest order
// matters.
export const arrangement = `## Arrangement

**Dual meter per call:** \`arrangementStart\`/\`arrangementLength\` resolve against the **song** time signature, while a clip's own \`start\`/\`firstStart\`/\`length\` resolve against the **clip** time signature. When a clip's meter differs from the song's, the same bar|beat literal denotes different absolute times across those params.`;

/**
 * Putting clips on the timeline: moving and splitting them, and stacking take
 * lanes. Four fifths of the subject, and only create-clip, update-clip, and
 * duplicate can run any of it — a read-only clip caller was paying for recipes
 * it had no tool to execute. The direction split (ADR-0019), applied to
 * arrangement.
 *
 * The read-track `arrangement-clips` clause rides along because it is a
 * round-trip instruction — read the take lanes so you can write to one — and
 * read-track's own `include` description already tells a reader that list
 * exists. (The tool-name bleed test can't see it: it scans for `ppal-` names.)
 */
export const arrangementWrite = `### Clip Destinations

One grammar names where a clip goes, 0-based throughout: \`t2/s0\` is track 2 in the first scene, \`t2\` is track 2's arrangement (which also needs \`arrangementStart\` or \`locator\`), and \`t2/l1\` is a take lane on it. create-clip calls it \`path\`; update-clip and duplicate call it \`toPath\`, since they move or copy an existing clip. There are no separate track/scene index params — a destination is always one of these strings.

create-clip's \`path\` takes a comma-separated list and may mix the two kinds, so one call can fill session positions and drop arrangement clips at the same time.

\`path\` also names clips to act *on*: update-clip and ppal-delete take a session position instead of \`ids\`, so knowing where a clip is saves reading it first just to learn its id.

### Moving Clips

\`arrangementStart\` moves arrangement clips; \`toPath\` moves session clips, pairing one destination per id (they don't cycle — two clips in one slot means the second overwrites the first). Moving clips changes their IDs - re-read to get new IDs.
\`arrangementLength\` sets arrangement playback region.
A duplicate without \`toPath\` lands on the source's own track, which overwrites the source when the position matches.

### Take Lanes (Arrangement Variations)

Stack alternate takes of an arrangement clip at the same position; only the active take plays (the user auditions/comps in Live's UI).

- A lane is a path segment: \`t2/l0\` is the track's first take lane, \`t2/l+\` appends a fresh one. Arrangement only, and duplicate is MIDI-only. Each \`l+\` in a list appends its own lane.
- Variation workflow: one duplicate with \`toPath: "t2/l+,t2/l+,t2/l+"\` + \`transforms\` using \`clip.index\`/\`clipseq()\` to vary each copy. read-track \`arrangement-clips\` include lists \`takeLanes\` — each entry carries its \`path\` (e.g. \`t2/l0\`) and \`name\`.
- 8 lanes/track max; creating over an existing clip replaces it (like the main lane). One-way: Producer Pal can't delete or comp take lanes — that's done in Live (expand the track's take-lane arrow to see them).
- Take-lane clips are append-only: \`update-clip\` (\`split\`, \`arrangementStart\`, \`arrangementLength\`) and \`ppal-delete\` warn+skip on them. Main→take duplicate recreates the clip from notes and drops envelope automation; take→main promote isn't supported. For any of these, ask the user to do it in Live's UI.`;
