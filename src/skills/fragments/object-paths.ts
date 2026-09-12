// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Track and scene addressing. The clip half of the grammar is taught in
// `arrangement-write`, gated on the clip writers; this is the half every
// track/scene tool needs, in both directions.
//
// Names no tool on purpose, so a wide gate costs nothing: the round trip is the
// content, and each tool's own `path` description says what it takes.
//
// Says nothing about `type: "return"` on create-track. That value still works
// but is no longer offered, and naming it here would push a model back toward
// the spelling `rt+` replaced.
export const objectPaths = `## Addressing Tracks and Scenes

A \`path\` names an object by where it is, counting from 0: \`t0\` is the first track, \`s0\` the first scene, \`rt0\` the first return track, \`mt\` the main track. Reads report a \`path\` beside every \`id\` and the write tools take one, so what you just read is what you address next — no re-reading an object to learn its id.

Reads take a comma-separated list too: \`path: "t0,t2"\` returns one entry per target in order, and a target that can't be read is \`ok: false\` with a \`reason\`. One target returns the object, not an array.

**A number the user says is 1-based — subtract one.** Their "scene 1" is \`s0\`, their "scene 3" is \`s2\`, their "track 3" is \`t2\`. Live labels scenes from 1 too, so the scene shown as "3" is also \`s2\`. Never pass their number straight through.

A track's \`type\` says \`midi\` or \`audio\`, nothing else. It's absent on a return track and on the main track, whose \`path\` is what identifies them.

The \`+\` spellings name a place that doesn't exist yet, for creating: \`t+\` appends a track, \`rt+\` adds a return track, \`s+\` appends a scene. On create, \`t2\` inserts at 2 instead. Return tracks always go on the end, so \`rt2\` reads an existing one but is not a place you can create at.

Make several with a comma-separated path list, one entry per object, in order: \`t+,t+,t+\` appends three tracks, \`s+,s+\` appends two scenes, \`t2,t2\` inserts two tracks at 2 with the second after the first. \`name\` and \`color\` pair with the list 1:1.`;

// The small-model half. Not a trim for its own sake: a small model makes one
// object at a time, so a path list points at something it never writes, and the
// `type` note answers a question the small document never raises.
//
// What's left is the 1-based rule and the roots, in that order. Small models
// already know paths count from 0 — they say so while getting it wrong. What
// they guess at is what the USER meant, so that sentence leads.
export const objectPathsBasic = `## Addressing Tracks and Scenes

A \`path\` names an object by where it is, counting from 0: \`t0\` is the first track, \`s0\` the first scene, \`rt0\` the first return track, \`mt\` the main track. Reads report a \`path\` beside every \`id\`, and the write tools take one.

**A number the user says is 1-based — subtract one.** Their "scene 1" is \`s0\`, their "scene 3" is \`s2\`, their "track 3" is \`t2\`. Live labels scenes from 1 too, so the scene shown as "3" is also \`s2\`. Never pass their number straight through.

The \`+\` spellings name a place that doesn't exist yet: \`t+\` appends a track, \`rt+\` adds a return track, \`s+\` appends a scene.`;
