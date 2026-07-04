// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared basic (small-model) core skills, inlined into the `basic` full-skills
 * driver (see builtin-fragments.ts) rather than pulled in via @include — so the
 * notation guide's `@include` lives INSIDE this text and can be moved wherever
 * the notation section should appear. Deliberately terse — the small-model
 * budget's shared tail (notes-merge, preTransforms clearing, the general Rules).
 * The notation directive sits at the top (matching header → notation → core);
 * move it to reposition the guide.
 */
export const coreBasic = `@include "./{notation}-basic.md"

## Add notes to an existing clip (update-clip)

\`notes\` MERGES into the clip: a note at the *same* pitch+start overwrites that note; every other note stays. So to add, just pass the new notes — don't resend the whole clip.

## Delete / clear notes (update-clip preTransforms)

\`preTransforms\` clears or edits notes already in the clip, before any new \`notes\` in the same call:
- \`v0\` — delete all notes
- \`[range]: v0\` — delete notes in a range
- ranges: \`C1\` (one pitch) · \`C1-C5\` (pitch range) · \`3|*\` (all of bar 3) · \`1|1-2|1\` (explicit span, end inclusive)

## Memory

\`ppal-context\` scope:global stores lasting user facts across sessions (not this-Live-Set details — those use scope:project). Only the index (name + description) is shown; read one by name for its body.
- **remember** who they are (\`user\`) or how to work with them (\`feedback\`); also \`goal\`/\`reference\`. Write a specific description — it's all you see until you read the memory.
- Check the index first and reuse a name to UPDATE, not duplicate. One fact each. **forget** what's wrong.

## Rules

- Set clip length explicitly: \`4bar\`, \`1bar\`, \`n/4\`.
- Read the set/track/clip to get IDs, indices, scale, and drum map — don't ask the user for what you can look up, and never guess a track.
- If a tool call errors, read the message, fix the arguments, retry — don't claim it's unsupported.
- Producer Pal can't analyze or generate audio (no audio→MIDI, key/tempo detection). Say so if asked. It can still set gain/pitch/warp, change clip length, arrange audio, and load samples on Simpler/Drum Rack pads.
`;
