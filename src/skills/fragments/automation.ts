// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Clip automation envelopes, and converting an audio clip to a track. Shipped
// only while the Producer Pal remote script answers, since nothing else can do
// either. Split by direction like the notation heads: `automation` is what a
// reader needs, `automationWrite` only what update-clip can use.
//
// The handoffs (a device read for parameter ids, duplicate and delete for the
// arrangement round trip) aren't named as tools: this gate can't promise the
// caller has them.
//
// Hosting plug-ins is unfinished: release builds don't mention it.
const hostedEnabled = process.env.ENABLE_HOSTED_PLUGINS === "true";

const hostedRead = hostedEnabled
  ? ` A hosted VST3 param's entry names the plug-in's param, with a \`slot\` ("Automation 002") and an \`id\` like \`t0/d0/h56\` that works as a write target.`
  : "";

const hostedWrite = hostedEnabled
  ? ` A hosted VST3 param's target is its device path and \`h\` id (\`t0/d0/h56\`); it takes one of the plug-in's automation slots (the result says which; a device read shows \`slot\`). When every slot has automation the line is skipped: delete a slot's automation to free it.`
  : "";

export const automation = `## Clip Automation

**Session and arrangement clips.** An arrangement clip has no envelopes of its own — its automation is the track's automation lane, over exactly that clip's span (MIDI or audio). Live can't read a lane's points, so only a session clip's envelopes can be read.

**Read** with ppal-read-clip \`include: ["envelopes"]\` — any clip read shows \`envs: true\` on a session clip that has some. Each entry names the automated parameter, its \`id\`, and its points as \`bar|beat value\` (a value may be followed by Live's display in parentheses), joined by \`/\` (straight ramp), \`_\` (hold, then jump) or \`~N\` (curved ramp, N from -1 to 1 with no space; positive bends above the straight line, negative below).${hostedRead}

A track read (\`mixer\`), a device read (params with values, or \`chains\`) and a live set read (tempo) show \`automation\` where the arrangement has a lane. It's unknown, and left out, while the track plays from Session. Writing a parameter that has an arrangement lane (a mixer field, a device param, tempo, mute) overrides the lane, which Live then ignores until Re-Enable Automation; the result says so.`;

export const automationWrite = `**Write** with ppal-update-clip \`envelopes\` (its schema gives the line format and value ranges): one \`<target>: <points>\` line per parameter, the target a param \`id\` or \`volume\`, \`pan\`, \`send0\`…, never a display name; a session clip's \`pan:\` with nothing after clears just that one.${hostedWrite} Mixer \`volume\`: 1 = +6 dB. Don't rewrite an envelope read as \`truncated\`: the part not shown is lost.

**On an arrangement clip** times run once across its whole span however it loops, and points past its end never play. The lane returns to its old value after the span. The clip is re-created, so the result gives its **new id**; its content and settings are kept. Duplicating or moving an arrangement clip leaves its automation behind, and the lane can't be read to check, so automate the arrangement last, once clips stop moving.

**To automate a span with no clip yet**, or to reuse an envelope: automate a session clip, duplicate it onto the span (any \`arrangementLength\` works: the lane follows what the copy plays), then delete the session clip. The copy writes the session clip's envelopes into the lane (its result says so) and replaces the arrangement clips under it, so when notes are already there, give the session clip the same notes.

## Converting Audio Clips

ppal-update-clip \`convert\` (see its schema) makes a new MIDI track from an audio clip; Live's detection may find no notes.`;
