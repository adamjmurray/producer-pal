// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Moving clips on the arrangement timeline, and take lanes. Gated by duplicate
// and update-clip — a session-only task never needs it.
//
// The dual-meter note leads because it frames every bar|beat below it. It moved
// here from time-and-values, which is gated "always": the params it names belong
// to exactly this fragment's four tools, so on an "always" gate every other
// caller paid for it.
export const arrangement = `## Arrangement

**Dual meter per call:** \`arrangementStart\`/\`arrangementLength\` resolve against the **song** time signature, while a clip's own \`start\`/\`firstStart\`/\`length\` resolve against the **clip** time signature. When a clip's meter differs from the song's, the same bar|beat literal denotes different absolute times across those params.

### Moving Clips

\`arrangementStart\` moves arrangement clips; \`toSlot\` (trackIndex/sceneIndex, both 0-based — scene 1 = index 0) moves session clips. Moving clips changes their IDs - re-read to get new IDs.
\`arrangementLength\` sets arrangement playback region. \`split\` divides arrangement clips at bar|beat positions measured from the clip's own start (1|1 = clip start, NOT song position).

### Take Lanes (Arrangement Variations)

Stack alternate takes of an arrangement clip at the same position; only the active take plays (the user auditions/comps in Live's UI).

- \`takeLane\` on create-clip + duplicate (arrangement only; duplicate is MIDI-only): omit/\`0\` = main lane; \`1+\` = that lane (auto-created up to it); \`"new"\` = append a fresh lane. \`takeLaneName\` names a lane this call creates.
- Variation workflow: a few duplicate calls with \`takeLane: "new"\` + \`transforms\` to vary each copy. read-track \`arrangement-clips\` include lists \`takeLanes\` — each entry carries \`takeLane\` (1-based, matching the write param) and its \`name\`, so you can round-trip a read back to a write directly.
- 8 lanes/track max; creating over an existing clip replaces it (like the main lane). One-way: Producer Pal can't delete or comp take lanes — that's done in Live (expand the track's take-lane arrow to see them).
- Take-lane clips are append-only: \`update-clip\` (\`split\`, \`arrangementStart\`, \`arrangementLength\`) and \`ppal-delete\` warn+skip on them. Main→take duplicate recreates the clip from notes and drops envelope automation; take→main promote isn't supported. For any of these, ask the user to do it in Live's UI.`;
