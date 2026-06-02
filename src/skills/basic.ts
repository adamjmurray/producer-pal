// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export const skills = `# Producer Pal Skills

## MIDI Notation

Pitches: C0-G8 with # or b for sharps/flats (C#3, Bb2). C3 = middle C
Format: v<vel> n<dur> [p<prob>] pitch(es) bar|beat(s)
- Set v/n/p *before* the pitch(es); they apply to all that follow. Omit any to reuse its last value — a shortcut: values don't reset per note, so re-state one to change it
- v: velocity 0-127 (default 100). n: duration, an absolute note value (default n/4 = quarter). p: probability 0-1 (default 1) — opt-in; if any note uses it, set it on every note
- Durations REQUIRE a denominator: n/4 = quarter, n/8 = eighth, n/16 = sixteenth, n/12 = eighth triplet. n3/8 = dotted quarter, n3/16 = dotted eighth. Bare integers or decimals are invalid
- **Set n explicitly and re-set it per drum/pitch** — it persists, so a hat's n/16 otherwise carries onto the next kick
- Positions: bar|beat — reads left-to-right like the name: \`4|2\` is bar 4 beat 2, \`2|4\` is bar 2 beat 4, both 1-indexed. For one note per bar, step the LEFT number (\`1|1 2|1 3|1 4|1\`); to move within a bar, step the right number (\`1|1 1|2 1|3 1|4\`). A decimal places a note *within* a beat — \`1|1.5\` = the "&" (halfway), \`1|1.75\` = the last 16th (in 4/4)

### Melody (one quarter note per beat across 2 bars)
\`\`\`
n/4 C3 1|1 D3 1|2 E3 1|3 F#3 1|4
G3 2|1 A3 2|2 G#3 2|3 E3 2|4
\`\`\`

### Dotted rhythm (dotted-8th + 16th gallop; re-set n, the 16th lands on .75)
\`\`\`
n3/16 C3 1|1  n/16 C3 1|1.75
n3/16 E3 1|2  n/16 E3 1|2.75
\`\`\`

### Chords (set duration with n, n/1 = 4 quarters)
\`\`\`
n/1
C3 E3 G3 1|1
D3 F3 A3 2|1
E3 G3 B3 3|1
F3 A3 C4 4|1
\`\`\`

### Drums (commas = beat list; {beat}x{count}[@{step}] repeats — {count} notes, {step} apart, a note value that defaults to the duration)
\`\`\`
n/8 C1 1|1,3 2|1,3 3|1,3 4|1,3  # kick (set duration per lane)
n/8 D1 1|2,4 2|2,4 3|2,4 4|2,4  # snare
n/16 Gb1 1|1.5x4@n/4 2|1.5x4@n/4 3|1.5x4@n/4 4|1.5x4@n/4  # hats on the upbeats (the &s), quarter-note step
\`\`\`

## Editing existing notes (update-clip)

\`notes\` MERGES into the clip — a note overwrites the existing note at the *same* pitch+start (restate it to change its duration/velocity in place); other notes stay. To replace a region or rewrite a bar, clear it first with \`preTransforms\` or the old notes linger. Don't rewrite the whole clip to fix a few notes.

\`preTransforms\` edits or clears notes already in the clip — on its own, or before adding new \`notes\` in the same call. Same v/n/p/pitch tokens as above, with an optional range:
- \`[range]: <change>\` — omit the range to affect all notes
- changes: \`v0\` delete · \`vN\` set velocity (N=1-127) · \`n/4\`/\`1bar\`/\`1bar+n/4\` set duration · \`pN\` set probability (N=0-1) · \`C4\` move notes to a pitch (drum-lane remap)
- range: \`C1\`/\`C1-C5\` (pitch); time: \`3|*\` (whole bar 3), \`1|*-2|*\` (whole bars 1-2), or \`1|1-2|1\` (explicit span, end inclusive)
- clear a bar: \`3|*: v0\` (\`|*\` = exactly that bar; \`3|1-4|1\` overshoots onto 4|1) · clear all: \`v0\`

Here a bar|beat range SELECTS existing notes (a filter); in \`notes\` a bar|beat PLACES a note.

Example — swap bar 1's snare, keep everything else:
\`preTransforms: "D1 1|1-2|1: v0"\` (clear old snares) with \`notes: "D1 1|2,4"\` (new snares)

## Rules
- Set clip lengths explicitly: \`4bar\` for 4 bars, \`n/4\` for a quarter, \`1bar+n/4\` for mixed
- \`n\` durations, \`@step\` intervals, and clip \`length\` fractions are absolute note values (a quarter is a quarter in any meter); a bar|beat position is meter-relative
- Other meters: the grid beat isn't a quarter (in 6/8 a beat is an eighth), and a beat decimal is a fraction of *that* beat (so \`1|1.5\` is an eighth only in 4/4). For evenly-spaced notes use a repeat \`1|1x<count>\` — put a real number where \`<count>\` is (e.g. \`n/4 C1 1|1x5\` = 5 quarters filling a 5/4 bar; \`1|1x3\` fills 6/8) — its step defaults to the duration so spacing stays right in any meter; don't hand-list beats. For a single note holding one whole bar in any meter, use the \`1bar\` duration (e.g. \`1bar C1 1|1\`) — bars are the bare \`Nbar\` form, never \`n1bar\`
- If the user references a track, get its trackIndex and id - never guess
- When asked to create or edit music, do it: read the set/track/clip to get the IDs, indices, scale, and drum map you need (don't ask the user for things you can look up), and write the notes yourself from the project's scale unless specific pitches were given
- If a tool call errors, read the message, fix the arguments, and retry — don't claim the operation is unsupported
`;
