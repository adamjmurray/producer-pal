// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Track and scene addressing. The clip half of the grammar is taught in
// `arrangement-write`, gated on the clip writers; this is the half every
// track/scene tool needs, in both directions.
//
// Names one tool, and only where the spelling belongs to it: ppal-update-track
// owns the take lanes, and no narrower gate keeps it. Everything else here is
// the round trip, which each tool's own `path` description already covers.
//
// Says nothing about `type: "return"` on create-track. That value still works
// but is no longer offered, and naming it here would push a model back toward
// the spelling `rt+` replaced.
export const objectPaths = `## Addressing Tracks and Scenes

A \`path\` names an object by where it is, counting from 0: \`t0\` is the first track, \`s0\` the first scene, \`rt0\` the first return track, \`mt\` the main track. Reads report a \`path\` beside every \`id\` and the write tools take one, so what you just read is what you address next — no re-reading an object to learn its id.

Reads take a comma-separated list too: \`path: "t0,t2"\` returns one entry per target in order, and a target the call couldn't carry out is \`ok: false\` with a \`reason\` — reads and writes alike. One target returns the object, not an array, and errors instead of reporting.

A write's entry says only what you don't already know: a value that landed as you asked for it isn't repeated back, so an entry with nothing but an \`id\` and \`path\` means everything worked. What comes back is a value Live kept instead of yours, with a \`reason\` saying so.

**A number the user says is 1-based — subtract one.** Their "scene 1" is \`s0\`, their "scene 3" is \`s2\`, their "track 3" is \`t2\`. Live labels scenes from 1 too, so the scene shown as "3" is also \`s2\`. Never pass their number straight through.

A track's \`type\` says \`midi\` or \`audio\`, nothing else. It's absent on a return track and on the main track, whose \`path\` is what identifies them.

The \`+\` spellings name a place that doesn't exist yet, for creating: \`t+\` appends a track, \`rt+\` adds a return track, \`s+\` appends a scene. On create, \`t2\` inserts at 2 instead. Return tracks always go on the end, so \`rt2\` reads an existing one but is not a place you can create at.

Make several with a comma-separated path list, one entry per object, in order: \`t+,t+,t+\` appends three tracks, \`s+,s+\` appends two scenes, \`t2,t2\` inserts two tracks at 2 with the second after the first. Value params that take a list — \`name\`, \`color\`, a scene's \`timeSignature\` — pair with it 1:1; the rest apply to every object. With one target a comma is part of the value, not a separator: it's how a name like \`Verse, take 2\` is set.

A clip slot past the last scene makes the scenes up to it — writing a clip there, moving one there, copying one there — and the entry's \`created\` says which (\`created: "s8-s9"\`). A path past the last rack chain (\`t0/d0/c2\`) or take lane (\`t0/l2\`) fills the gap the same way, and \`created\` names those too (\`c1-c2\`, \`l1-l2\`). Updating a scene never makes one: only a destination says what a new scene would hold.

A track's take lanes are \`ppal-update-track\`'s: \`t2/l+\` appends one (each \`l+\` in the list its own), and \`t2/l<n>\` names an existing lane, creating the lanes up to it. \`name\` is the only param a lane takes, and \`ppal-read-track\` reads a lane path too.`;

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
