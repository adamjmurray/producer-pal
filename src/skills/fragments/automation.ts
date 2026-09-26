// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Clip automation envelopes. Shipped only while the Producer Pal remote script
// answers, since nothing else can reach an envelope at all.
//
// The handoffs (read-device for a parameter's range, duplicate and delete for
// the arrangement round trip) are written without the `ppal-` prefix, the way
// the arrangement fragment writes them: they are steps in a recipe, not tools
// this gate can promise the caller has.
export const automation = `## Clip Automation

**Session clips only.** An arrangement clip has no envelopes of its own — its automation lives in the track's automation lane.

**Read** with ppal-read-clip \`include: ["envelopes"]\`. Each entry names the automated parameter, its \`id\`, and its points.

**Write** with ppal-update-clip \`envelopes\`: one \`<target>: <notation>\` line per parameter. A target is a parameter \`id\` (read-device lists them) or a mixer name — \`volume\`, \`pan\`, \`send0\`... Each line replaces that parameter's whole envelope; a line with nothing after the colon clears it.

**Notation** is \`bar|beat value\` points in the clip's meter, \`~\` ramping to the next and \`>\` holding then jumping: \`1|1 0 ~ 3|1 0.8 > 4|1 0.2\`. Values are RAW, not the units Live displays — read-device gives each parameter's \`min\`/\`max\` (most are 0..1).

**To automate the arrangement:** automate a session clip, duplicate it onto the arrangement span, then delete the session clip. The copy writes the envelope into the track's automation lane, which stays behind. When the notes are already in the arrangement, use a temporary session clip — empty, or holding the same notes — just to carry the automation. A later copy replaces the lane over its own span.`;
