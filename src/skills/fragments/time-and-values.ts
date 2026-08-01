// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The always-on fragment: the units every other fragment assumes. Durations,
// positions, and clip lengths read the same in every notation (the notation head
// only governs how `notes` content is encoded), so this text is
// notation-independent by construction — keep notation-specific syntax OUT of it.
//
// "always" also means it may not name a tool or a parameter: a caller with one
// tool pays for every word. Two sections used to break that. `## Audio Clips`
// listed read-clip's `sample`/`warp` fields and create-clip's warp behavior —
// those live on the params themselves now, the one place a caller without the
// tool never sees. The song-vs-clip meter note moved to arrangement.ts, whose
// gate is exactly the four tools taking those params. The "what Producer Pal
// can't do with audio" blurb is a conversation concern and lives in
// getting-help.ts.
//
// What's left defines UNITS, not fields. A rule about which field resolves
// against which meter belongs with the fields.
export const timeAndValues = `## Time & Note Values

Applies to every notation: transforms, clip \`length\`, and arrangement durations use these units regardless of how you write \`notes\`.

**Units:** a plain "beat" is your meter's beat — the *musical beat* (a quarter in x/4, an eighth in x/8). It's what sub-beat decimals and bare numbers in transform expressions count. **Note values** (\`n/4\`, \`n/8\`, \`±n\` offsets, durations) are absolute and meter-invariant: a quarter is a quarter in any meter. \`Nbar\` = N of your meter's bars. (Live's internal API unit is the quarter-note "Ableton beat"; you never write it directly.) Bare numbers are valid ONLY in transform expressions — position/duration/length/offset fields require the \`n\` form.

- Durations: absolute note values (denominator mandatory). \`n/4\` = quarter, \`n/8\` = eighth, \`n/16\` = sixteenth, \`n/12\` = eighth triplet (3 in a quarter), \`n3/8\` = dotted quarter (3 eighths). A quarter is a quarter in any meter
- **Dotted \`d\` / triplet \`t\` suffix** (shortcuts, so you don't compute the fraction): \`d\` = dotted (×1.5), \`t\` = triplet (×2/3). \`n/4\` quarter · \`n/4d\` = \`n3/8\` dotted quarter · \`n/4t\` = \`n/6\` quarter triplet · \`n/8t\` = \`n/12\` eighth triplet. One suffix only (no \`n/4dt\`); works on any note value and on \`±n\` offsets/\`@n\` steps (\`1|1+n/8t\`, \`@n/8t\`). (These note values take \`d\`/\`t\` rather than a trailing \`.\`, since \`.\` is the decimal glyph in the bar|beat positions below)
- Clip \`length\` and arrangement durations: \`Nbar\` (meter-aware, e.g. \`4bar\`), \`n<fraction>\` note value (e.g. \`n/4\` = quarter, \`n/8\` = eighth), or \`Nbar±n<fraction>\` mixed — the tail adds or subtracts, so \`1bar+n/4\` is a bar plus a quarter and \`1bar-n/16\` is *almost a full bar* (a bar minus a 16th). No bare fractions/integers/decimals
- \`Nbar\` is also valid as a **note duration** — meter-aware, so \`1bar\` holds one whole bar in any meter (6 grid beats in 6/8, 5 in 5/4). Bars use the bare \`Nbar\` form — never an \`n\` prefix (\`1bar\`, not \`n1bar\`; \`n\` is only for denominator-bearing note values)

**Positions** in transform selectors and single-point fields use **bar|beat**: 1-indexed, \`X|Y\` reads left-to-right (\`4|2\` = bar 4 beat 2, \`1|1\` = the very start), meter-relative. Sub-beat via a decimal (\`2|3.5\`) or an \`±n\` note-value offset off the grid beat (\`1|1+n/12\`).`;
