// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Skills text for the experimental, dev-only `code` transform parameter (gated
// behind ENABLE_CODE_EXEC). A top-level entry in the standard driver's manifest
// like every other fragment — in a release build the fragment resolves to an
// EMPTY body rather than being absent, so the manifest's include line stays
// valid and the resolver's unknown-fragment warning keeps its meaning (see
// builtin-fragments.ts).
export const codeTransforms = `### Code Transforms

For complex logic beyond transforms, use the \`code\` parameter with JavaScript. \`code\` is a single string (function body only), broadcast across every clip/copy. It runs as:
\`(function(notes, context) { <code> })(notes, context)\`

For per-clip variation, branch on \`context.clip.index\` (0-based) and \`context.clip.count\` (batch size). For structurally-distinct edits per clip, make separate tool calls.

Example \`code\`:
\`\`\`javascript
return notes.filter(n => n.pitch >= 60).map(n => ({
  ...n,
  velocity: Math.min(127, n.velocity + 20 + context.clip.index * 5)
}));
\`\`\`

All times are musical beats (the meter's beat — an eighth in 6/8), matching \`beatsPerBar\`; \`start / beatsPerBar\` is the bar offset in any meter.

**Note properties (required: pitch, start):**
- \`pitch\`: 0-127 (60 = C3)
- \`start\`: musical beats from clip start
- \`duration\`: musical beats (default: 1)
- \`velocity\`: 1-127 (default: 100)
- \`velocityDeviation\`: 0-127 (default: 0)
- \`probability\`: 0-1 (default: 1)

**Context properties:**
- \`track\`: { index, name, type, color }
- \`clip\`: { id, name, length, timeSignature, looping, index, count } (length in musical beats)
- \`location\`: { view, path?, arrangementStartBeats? } - an arrangement path carries where the clip starts, e.g. \`t0[5|1]\`; \`arrangementStartBeats\` is that same position as a number, for arithmetic
- \`liveSet\`: { tempo, scale?, timeSignature }
- \`beatsPerBar\`: number (musical beats per bar)

**Processing order:** notes → transforms → code — code receives the notes after parsing and transforms, and can further transform them.`;
