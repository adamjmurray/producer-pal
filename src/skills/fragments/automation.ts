// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Clip automation envelopes, and converting an audio clip to a track. Shipped
// only while the Producer Pal remote script answers, since nothing else can do
// either.
//
// The handoffs (a device read for parameter ids, duplicate and delete for the
// arrangement round trip) aren't named as tools: this gate can't promise the
// caller has them.
export const automation = `## Clip Automation

**Session and arrangement clips.** An arrangement clip has no envelopes of its own — its automation is the track's automation lane. Writing \`envelopes\` to one writes the lane over exactly that clip's span (MIDI or audio).

**Read** with ppal-read-clip \`include: ["envelopes"]\` — any clip read shows \`envs: true\` on a session clip that has some. Each entry names the automated parameter, its \`id\`, and its points.

A track read (\`mixer\`) and a device read (params with values) show \`automation\` where the arrangement has a lane. It's unknown, and left out, while the track plays from Session.

**Write** with ppal-update-clip \`envelopes\`: one \`<target>: <notation>\` line per parameter. A target is a parameter \`id\` (a device read lists them) or a mixer name — \`volume\`, \`pan\`, \`send0\`... Each line replaces that parameter's whole envelope; on a session clip a line with nothing after the colon clears it. Don't rewrite an envelope read as \`truncated\`: the part not shown is lost.

**Notation** is \`bar|beat value\` points in the clip's meter, joined by \`/\` (straight ramp), \`_\` (hold, then jump) or \`~N\` (curved ramp, N from -1 to 1 with no space; positive bends above the straight line, negative below): \`1|1 0 / 3|1 0.8 _ 4|1 0.2 ~0.5 5|1 1\`. Values are RAW, usually 0..1 — not the display units a device read's \`min\`/\`max\` use (a % reads 0..100). An out-of-range value is refused with the real range. Mixer \`volume\`: 0.85 = 0 dB, 1 = +6 dB; \`pan\`: -1 = hard left, 0 = center, 1 = hard right.

**On an arrangement clip** time 1|1 is where the clip starts, running once across its whole span however it loops; points past its end never play. The lane returns to its old value after the span. The clip is re-created, so the result gives its **new id**; its content and settings are kept. A lane can't be cleared (a line with nothing after the colon is refused): write a flat line instead. Moving an arrangement clip leaves its automation behind.

**To automate a span with no clip yet**, or to reuse an envelope: automate a session clip, duplicate it onto the span (any \`arrangementLength\` works: the lane follows what the copy plays), then delete the session clip. The copy writes the session clip's envelopes into the lane and replaces the arrangement clips under it, so when notes are already there, give the session clip the same notes.

## Converting Audio Clips

ppal-update-clip \`convert\` makes a new track from an audio clip: \`drums\`, \`melody\` or \`harmony\` give a MIDI track with a clip of the notes Live detects (it can find none), \`simpler\` or \`drum-rack\` an instrument track playing the clip. The track is added, so later track paths shift; the result names the new track and clip.`;
