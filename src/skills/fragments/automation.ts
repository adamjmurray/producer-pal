// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Clip automation envelopes. Shipped only while the Producer Pal remote script
// answers, since nothing else can reach an envelope at all.
//
// The handoffs (a device read for parameter ids, duplicate and delete for the
// arrangement round trip) aren't named as tools: this gate can't promise the
// caller has them.
export const automation = `## Clip Automation

**Session clips only.** An arrangement clip has no envelopes of its own — its automation lives in the track's automation lane.

**Read** with ppal-read-clip \`include: ["envelopes"]\`. Each entry names the automated parameter, its \`id\`, and its points.

**Write** with ppal-update-clip \`envelopes\`: one \`<target>: <notation>\` line per parameter. A target is a parameter \`id\` (a device read lists them) or a mixer name — \`volume\`, \`pan\`, \`send0\`... Each line replaces that parameter's whole envelope; a line with nothing after the colon clears it. Don't rewrite an envelope read as \`truncated\`: the part not shown is lost.

**Notation** is \`bar|beat value\` points in the clip's meter, \`~\` ramping to the next and \`>\` holding then jumping: \`1|1 0 ~ 3|1 0.8 > 4|1 0.2\`. Values are RAW, usually 0..1 — not the display units a device read's \`min\`/\`max\` use (a % reads 0..100). An out-of-range value is refused with the real range. Mixer \`volume\`: 0.85 = 0 dB, 1 = +6 dB; \`pan\`: -1 = hard left, 0 = center, 1 = hard right. \`pan\`: -1 = hard left, 0 = center, 1 = hard right.

**To automate the arrangement:** automate a session clip, duplicate it onto the arrangement span, then delete the session clip. The copy writes the envelope into the track's automation lane, which stays behind. When the notes are already in the arrangement, use a temporary session clip — empty, or holding the same notes — just to carry the automation. A later copy replaces the lane over its own span.`;
