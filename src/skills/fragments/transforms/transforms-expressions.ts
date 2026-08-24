// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Tier 2 of the three transforms fragments: expressions that read the note's
// current state and run it through a function. `swing()` / `quant()` live here
// rather than with the generative operations despite being filed under "Timing
// functions" in the old monolith — "swing this" is among the most common
// requests, and the tiers are cut by request frequency.
//
// The Variables list is here (not duplicated into transforms-generative): with
// nesting forbidden there is no fragment-level DRY, so the generative tier just
// USES the vocabulary this one defines. Keep it that way — a second copy is what
// drifts.
export const transformsExpressions = `### Transform Expressions & Functions

An expression can read the note's current state and run it through a function, not just name a constant.

**Variables:** \`note.pitch\`, \`note.velocity\`, \`note.start\`, \`note.duration\`, \`note.probability\`, \`note.deviation\`, \`note.index\` (time-ordered), \`note.count\` (MIDI), \`next.pitch\`, \`next.velocity\`, \`next.start\`, \`next.duration\` (next distinct-start note; skips chords; warns on last note), \`audio.gain\`, \`audio.pitchShift\` (audio), \`clip.duration\`, \`clip.index\` (order of the clips), \`clip.count\`, \`clip.position\` (arrangement only)

**Math functions:** round(x), floor(x), ceil(x), abs(x), clamp(val,min,max), wrap(val,min,max) (wrap to inclusive range), reflect(val,min,max) (bounce within inclusive range), min(a,b,...), max(a,b,...), pow(base,exp), snap(pitch) (snap to Live Set scale; no-op if no scale), step(pitch, offset) (move by offset scale steps; even distribution for waveforms), legato([tolerance]) (set duration to reach next note's start time; optional tolerance in musical beats groups nearby starts as chords, e.g. legato(0.1) after humanizing)

**Timing functions:** swing(amount [, grid] [, raw]) (auto-quantizes to grid then applies swing; amount=delay in musical beats — meter-relative, so these hints assume a quarter-note beat and scale up in x/8: 0.02=subtle, 0.05=medium, 0.1=heavy; grid: default = half the meter's beat (8th-note swing in x/4, 16th in x/8); override e.g. n/16; raw: skip auto-quantize), quant(grid) (snap to nearest grid point). Grid ref for both: n/4=quarter, n/8=8th, n/16=16th, n/12=triplet. swing()/quant() return an *absolute* position, so assign them with \`timing =\` (not \`+=\`). Relative nudges use \`+=\`/\`-=\` with a note value — \`timing += n/8\` shifts every note an eighth later

\`\`\`
timing = swing(0.05)             // swing (auto-quantizes). Use swing() alone unless asked for a specific grid
timing = quant(n/8)              // snap to 8th-note grid
timing = quant(n/16)             // snap to 16th-note grid
duration = legato()              // extend each note to reach the next
duration = legato(0.1)           // legato with tolerance (after humanizing timing)
pitch = snap(note.pitch + 7)     // transpose up fifth, snap to scale
pitch = wrap(note.pitch + 5, C3, C5) // transpose up 5, wrap within C3-C5
gain = audio.gain - 6            // reduce audio clip by 6 dB
where(abs(note.start - 4) < 1): velocity += 20 // functions work in where() too: near beat 4, either side
\`\`\`

swing() auto-quantizes, so changing the amount is always safe without a separate quant(). Skip it with \`raw\`: \`swing(0.05, raw)\``;
