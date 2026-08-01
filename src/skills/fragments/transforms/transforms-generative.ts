// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Tier 3 of the three transforms fragments: operations that invent material —
// note-count ops that change how many notes exist, and waveforms that modulate a
// value across the clip. The least frequently requested tier, so it is the first
// one a narrow task drops.
//
// It USES the variable vocabulary defined in transforms-expressions rather than
// restating it (nesting is forbidden, so there is no shared sub-fragment; a
// second copy would drift).
//
// ORDERING CONSTRAINT: this tier REQUIRES transforms-expressions, it does not
// merely reference it. The `pitch = step(note.pitch, sin(n/1) * 7)` example
// calls step(), which only the expressions tier defines — ship generative
// without it and that line is a call to an undefined function. Naming a tool you
// don't define is fine (transforms-core names "waveforms" on purpose); shipping
// a worked example that CALLS one is not. The line can't be relocated either —
// it needs sin() from here and step() from there — so the constraint is recorded
// rather than dissolved: any per-worker fragment selection must include
// transforms-expressions whenever it includes this fragment.
export const transformsGenerative = `### Generative Transforms

Operations that change how many notes exist, or modulate a value across the clip.

**Note-count operations** (change how many notes exist — write on their own line, NOT as a value: \`velocity = ratchet(2)\` errors): \`ratchet(N)\` divides each matched note into N equal pieces (a roll); \`ratchet(n/16)\` instead cuts on the absolute 16th-note grid (pieces align to bar positions, partial slivers at the ends); \`repeat(offset, copies)\` echoes each matched note forward by \`offset\` (a note value like \`n/8\` or \`Nbar\`); \`copies\` defaults to 1, so \`repeat(n/8)\` adds one echo an 8th later and \`repeat(n/8, 3)\` adds three (it does NOT resize the clip — copies past the end stay hidden until you grow \`length\`; to double a loop AND lengthen the clip, use update-clip's \`duplicateLoop\` instead); \`split(2|1, 2|3)\` cuts at explicit, possibly unequal clip bar|beat positions (each position cuts whichever matched note spans it; add a trailing \`sync\` — \`split(6|1, sync)\` — to read positions on the arrangement timeline instead, ignored with a warning on session clips); \`merge()\` spans all same-pitch matched notes into one sustained note (optional gap tolerance: \`merge(0)\` glues only touching/overlapping notes, \`merge(n/8)\` glues notes within an 8th-note gap). A selector scopes them (\`C1: ratchet(4)\`, \`2|*: merge()\`); a transform after a note op sees the rebuilt notes (so \`note.index\` re-derives). MIDI only

**Waveforms** (-1.0 to 1.0, per note position; once for audio):
- \`cos(period)\`, \`square(period)\` - start at peak (1.0); \`sin(period)\`, \`tri(period)\`, \`saw(period)\` - start at zero, rise to peak
  - All accept optional phase offset — a 0..1 cycle fraction, not a time value: \`cos(n/4, 0.25)\` (quarter-cycle shift). square adds pulse width (3rd arg, also a 0..1 fraction): \`square(n/4, 0, 0.75)\` (phase=0, 75% duty cycle)
- \`rand([min], [max])\` - random value (no args: -1 to 1, one arg: 0 to max, two: min to max)
- \`seq(a, b, ...)\` - cycle by the property's natural axis: \`note.index\` for per-note params, or \`clip.index\` for clip-granular params (gain, pitchShift) that have no note axis (same result as \`clipseq()\` there)
- \`clipseq(a, b, ...)\` - cycle by \`clip.index\` across the batch of clips — forces the clip axis even on per-note params (enumerated per-clip variation, e.g. \`pitch += clipseq(0, 5, 7)\`)
- \`choose(a, b, ...)\` - random selection from arguments
- \`ramp(start, end)\` - linear interpolation; reaches end value at time range end (or clip end)
- \`curve(start, end, exp)\` - exponential (exp>1: slow start, exp<1: fast start); reaches end value at time range end
- For ramp/curve, end the time filter on the last note's beat position so it reaches its end value. In 4/4: last 8th=N|4.5, last 16th=N|4.75
- Waveform period is a note value: \`n/4\` = quarter-note cycle, \`n/1\` = whole-note cycle, \`n/2\` = half-note cycle. For a meter-aware bar-length cycle use \`Nbar\` (e.g. \`cos(1bar)\`, \`cos(4bar)\`). Same \`n\` fraction grammar as everywhere; bare numbers are beats
- \`sync\` keyword (last arg on periodic waves) anchors phase to the arrangement timeline (continuous across clips) instead of clip start. Only meaningful on arrangement clips: a session clip has no arrangement position, so \`sync\` is ignored and the wave degrades to clip-relative (phase resets at clip start) with a warning — the modulation still applies. Without \`sync\`, phase is clip-relative everywhere (the default)

\`\`\`
timing += 0.05 * rand()          // humanize timing
velocity += 20 * cos(n/2)        // cycle every half note (2 beats in 4/4)
velocity += 20 * cos(1bar, sync) // bar-length cycle, continuous across clips
1|1-4|4.75: velocity = ramp(40, 127) // crescendo over 4 bars (16th grid)
velocity = seq(100, 60, 80, 60)  // cycle accents per note (MIDI)
Gb1: pitch = seq(Gb1, Gb1, Gb1, Gb1, Ab1) // every 5th closed hat → open hat
pitch += clipseq(0, 5, 7)        // copy 0 unchanged, copy 1 +5, copy 2 +7 (per-clip)
pitch = step(note.pitch, sin(n/1) * 7) // oscillate ±7 scale steps smoothly
ratchet(2)                       // split each note into two equal pieces (a roll)
ratchet(n/16)                    // cut each note on the 16th-note grid instead
C1: ratchet(4)                   // 4-stroke roll on the kick only
repeat(1bar)                     // echo every note one bar later (does not resize the clip)
repeat(n/8, 3)                   // three 8th-note echoes (original + 3 copies)
split(2|1, 2|3)                  // cut notes at explicit (unequal) clip positions
split(6|1, sync)                 // cut at an arrangement-timeline position
merge()                          // span same-pitch notes into sustained notes
merge(0)                         // ...but only where they touch or overlap
\`\`\``;
