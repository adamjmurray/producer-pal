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

**Dual meter per call:** \`arrangementStart\`/\`arrangementLength\` resolve against the **song** time signature, while a clip's own \`start\`/\`firstStart\`/\`length\` resolve against the **clip** time signature. When a clip's meter differs from the song's, the same bar|beat literal denotes different absolute times across those params.

**Meter changes are invisible:** Live's API reports one song time signature — the meter under the playhead — with no way to find where the meter changes. Arrangement positions in a Set that changes meter mid-song are wrong past the first change. If you learn the user's Set does that, tell them and let them place arrangement clips in Live themselves.`;

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

One grammar names where a clip goes, 0-based throughout: \`t2/s0\` is track 2 in the first scene, \`t2\` is track 2's arrangement (which also needs \`arrangementStart\` or \`locator\`), and \`t2/l0\` is its first take lane. create-clip calls it \`path\`; update-clip and duplicate call it \`toPath\`, since they move or copy an existing clip. There are no separate track/scene index params — a destination is always one of these strings.

create-clip's \`path\` takes a comma-separated list and may mix the two kinds, so one call can fill clip slots and drop arrangement clips at the same time.

\`path\` also names clips to act *on*: update-clip and ppal-delete take a clip slot instead of \`id\`, so knowing where a clip is saves reading it first just to learn its id. Write results report the clip's \`path\` beside its \`id\`, so a follow-up call can use it without re-reading.

### Moving Clips

\`arrangementStart\` sets where on the song timeline a clip lands; \`toPath\` sets which lane it lands on — a session slot (\`t2/s3\`), a track's arrangement lane (\`t2\`), or a take lane (\`t2/l0\`, \`t2/l+\`). Use them together to move a clip across tracks; \`toPath\` alone keeps the clip's current position. In update-clip \`arrangementStart\`, \`arrangementLength\` and \`toPath\` each take a list paired in order with the ids, and none of them cycle: \`id: "c1,c2,c3"\` with \`arrangementStart: "1|1,5|1,9|1"\` sends each clip to its own bar. One \`arrangementStart\` or \`arrangementLength\` covers every clip, since a position holds any number of them; one \`toPath\` does not, because two clips in one slot means the second overwrites the first. A clip moved into a slot or onto a take lane is re-created there, so it loses its automation envelopes. Moving clips changes their IDs - re-read to get new IDs.
\`arrangementLength\` sets arrangement playback region.
\`arrangementSplit\` cuts clips at song positions — the same timeline as \`arrangementStart\`, not offsets into the clip. Positions outside a clip are ignored, so one call can cut several clips at the same bar.
A duplicate without \`toPath\` lands on the source's own track, which overwrites the source when the position matches.
duplicate's \`id\` takes a list, copying each source in turn: \`count\`, \`arrangementStart\` and \`locator\` apply to every one, so \`id: "c1,c2,c3"\` with \`arrangementStart: "5|1"\` drops all three at bar 5 on their own tracks. A \`toPath\` naming a track or take lane goes to every source; clip slots, devices and drum pads are shared out one per copy, since each holds a single object. \`name\`/\`color\` and \`clip.index\` count across every copy, not per source.

### Take Lanes (Arrangement Variations)

Stack alternate takes of an arrangement clip at the same position; only the active take plays (the user auditions/comps in Live's UI).

- A lane is a path segment: \`t2/l0\` is the track's first take lane, \`t2/l+\` appends a fresh one. Arrangement only. Each \`l+\` in a list appends its own lane.
- Promote a take back to the main lane with a \`toPath\` that has no \`l\` segment (\`t2\`). \`duplicate\` copies it and leaves the take alone; \`update-clip\` empties the take behind it.
- Variation workflow: one duplicate with \`toPath: "t2/l+,t2/l+,t2/l+"\` + \`transforms\` using \`clip.index\`/\`clipseq()\` to vary each copy. read-track \`arrangement-clips\` include lists \`takeLanes\` — each entry carries its \`path\` (e.g. \`t2/l0\`) and \`name\`.
- 8 lanes/track max; creating over an existing clip replaces it (like the main lane). One-way: Producer Pal can't delete or comp take lanes — that's done in Live (expand the track's take-lane arrow to see them).
- Take-lane clips are append-only. Moving one off its lane (\`update-clip\` with \`arrangementStart\` or \`toPath\`, to another lane, another track, or a session slot) copies the content to the destination and leaves a muted \`(moved) ...\` clip behind, because Live's API can't remove it — tell the user to delete that leftover in Live. A MIDI leftover is emptied of notes; an audio one keeps its sample (Live won't let it be cleared) and is only muted. \`arrangementSplit\`, \`arrangementLength\` and \`ppal-delete\` still warn+skip on a lane clip; those need Live's UI. Moving a main-lane clip ONTO a lane works: \`update-clip\` with \`toPath: "t2/l+"\`.
- Anything that puts a clip on a lane recreates it (MIDI from its notes, audio from its sample), which drops envelope automation and resets a warped audio clip's warp markers. The response says which applied.`;
