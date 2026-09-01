// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Track and scene addressing. The clip half of the grammar is taught in
// `arrangement-write`, gated on the clip writers; this is the half every
// track/scene tool needs, in both directions.
//
// Names no tool on purpose, so a wide gate costs nothing: the round trip is the
// content, and each tool's own `path` description says it takes one.
//
// Says nothing about `type: "return"` on create-track. That value still works
// but is no longer offered, and naming it here would push a model back toward
// the spelling `rt+` replaced.
export const objectPaths = `## Addressing Tracks and Scenes

A \`path\` names an object by where it is, 0-based: \`t2\` is track 2, \`rt0\` the first return track, \`mt\` the main track, \`s3\` scene 3. Reads report a \`path\` beside every \`id\` and the write tools take one, so what you just read is what you address next — no re-reading an object to learn its id.

A track's \`type\` says \`midi\` or \`audio\`, nothing else. It's absent on a return track and on the main track, whose \`path\` is what identifies them.

The \`+\` spellings name a place that doesn't exist yet, for creating: \`t+\` appends a track, \`rt+\` adds a return track, \`s+\` appends a scene. On create, \`t2\` inserts at 2 instead. Return tracks always go on the end, so \`rt2\` reads an existing one but is not a place you can create at.`;
