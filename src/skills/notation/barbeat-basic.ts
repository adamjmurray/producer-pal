// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * bar|beat basic (small-model) notation head, in two halves — the same
 * read/write carve the standard head takes (ADR-0019). {@link barbeatBasic}
 * keeps the base slot name and holds the format itself, which a caller needs to
 * parse what read-clip returns; {@link barbeatBasicWrite} is the worked examples,
 * gated on the two clip writers.
 *
 * Says nothing about editing a clip that already has notes. The merge note used
 * to close this head, and the equivalent closed stark's and midi-json's. All
 * three moved to `transforms-basic`, whose gate is exactly update-clip: only
 * update-clip merges (create-clip replaces the slot), while this head ships to
 * every note tool including the read-only ones, so the copies here were three
 * statements of an update-clip rule to callers who couldn't merge — and they
 * pointed at a `preTransforms` the fragment that defines it had already been
 * gated away from.
 *
 * The pitch line spells out the octave convention because this tier has no
 * `time-and-values`, where the standard tier states it once for everyone. The
 * other two basic heads carry their own statement (stark says "Ableton naming",
 * midi-json is numeric); this was the one place a model could read "C3 = middle
 * C" and still write C4 for middle C, an octave off in silence.
 */
export const barbeatBasic = `## MIDI Notation

Pitches: C0-G8, # or b for sharps/flats (C#3, Bb2). C3 = middle C = MIDI 60 (Ableton numbering; most other software calls this note C4).
Format: \`v<vel> n<dur> pitch(es) bar|beat\` — always state v and n explicitly (don't rely on defaults); set them *before* the pitches and they persist until you change them.
- v: velocity 0-127 (louder = higher)
- n: duration, and it REQUIRES a denominator: n/4 quarter, n/8 eighth, n/16 sixteenth, n/2 half, n/1 whole, n/12 eighth-triplet. Add \`d\` for dotted or \`t\` for triplet: n/4d = dotted quarter (= n3/8), n/8t = eighth triplet (= n/12). Bare numbers are invalid.
- bar|beat positions are 1-indexed and read left-to-right: \`4|2\` = bar 4 beat 2. One note per bar → step the LEFT number (\`1|1 2|1 3|1 4|1\`); move within a bar → step the right (\`1|1 1|2 1|3 1|4\`). A decimal lands inside a beat: \`1|1.5\` = the "&".
- The beat can be a comma-separated list: \`C1 1|1,3\` is that pitch on beats 1 and 3. Clips you read back use this form.`;

/**
 * bar|beat basic authoring half: the three worked examples. Every rule they
 * demonstrate is stated in the head above, so a read-only caller loses nothing
 * but the demonstration — which is exactly the half it can't act on.
 */
export const barbeatBasicWrite = `## Generate notes

Melody (a quarter note per beat):
\`\`\`
v100 n/4 C3 1|1 D3 1|2 E3 1|3 F#3 1|4
G3 2|1 A3 2|2 G#3 2|3 E3 2|4
\`\`\`

Chords (multiple pitches share one position; n/1 = a whole bar):
\`\`\`
v100 n/1 C3 E3 G3 1|1  D3 F3 A3 2|1
\`\`\`

Drums (re-set n per lane so it doesn't carry over):
\`\`\`
v100 n/8 C1 1|1,3          # kick
v100 D1 1|2,4              # snare
v80 n/16 Gb1 1|1.5,2.5,3.5,4.5   # hats (softer, on the offbeats)
\`\`\``;
