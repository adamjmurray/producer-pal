// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The standard skills body, inlined into the `standard` full-skills driver (see
// builtin-fragments.ts) rather than pulled in via @include — so the notation
// guide's `@include` lives INSIDE this text and can be moved wherever the
// notation section should appear. It sits at the top here (matching the original
// header → notation → core order); move the directive to reposition the guide.
//
// The task-oriented sections (transforms, library, devices, arrangement) are
// pulled in via the `@include` manifest mid-document, each its own override
// slot, so a user's driver override can suppress one by deleting its include
// line while everything still included keeps tracking the release built-ins.
// What stays inline is small and universal (units, audio basics, workflow,
// memory, help). Blank lines in the manifest are load-bearing: fragments carry
// no leading/trailing blank lines, so the blank line between two includes IS the
// blank line between their sections. (core-transforms glues its code-transforms
// include so it too ends with no trailing newline — see core-transforms.ts — so
// every include gets a uniform blank line here.)
export const coreStandard = `@include "./{notation}-standard.md"

## Time & Note Values

Applies to every notation: transforms, clip \`length\`, and arrangement durations use these units regardless of how you write \`notes\`.

**Units:** a plain "beat" is your meter's beat — the *musical beat* (a quarter in x/4, an eighth in x/8). It's what sub-beat decimals and bare numbers in transform expressions count. **Note values** (\`n/4\`, \`n/8\`, \`±n\` offsets, durations) are absolute and meter-invariant: a quarter is a quarter in any meter. \`Nbar\` = N of your meter's bars. (Live's internal API unit is the quarter-note "Ableton beat"; you never write it directly.) Bare numbers are valid ONLY in transform expressions — position/duration/length/offset fields require the \`n\` form.

- Durations: absolute note values (denominator mandatory). \`n/4\` = quarter, \`n/8\` = eighth, \`n/16\` = sixteenth, \`n/12\` = eighth triplet (3 in a quarter), \`n3/8\` = dotted quarter (3 eighths). A quarter is a quarter in any meter
- **Dotted \`d\` / triplet \`t\` suffix** (shortcuts, so you don't compute the fraction): \`d\` = dotted (×1.5), \`t\` = triplet (×2/3). \`n/4\` quarter · \`n/4d\` = \`n3/8\` dotted quarter · \`n/4t\` = \`n/6\` quarter triplet · \`n/8t\` = \`n/12\` eighth triplet. One suffix only (no \`n/4dt\`); works on any note value and on \`±n\` offsets/\`@n\` steps (\`1|1+n/8t\`, \`@n/8t\`). (bar|beat uses \`d\`/\`t\`, not \`.\`, since \`.\` is its decimal glyph)
- Clip \`length\` and arrangement durations: \`Nbar\` (meter-aware, e.g. \`4bar\`), \`n<fraction>\` note value (e.g. \`n/4\` = quarter, \`n/8\` = eighth), or \`Nbar±n<fraction>\` mixed — the tail adds or subtracts, so \`1bar+n/4\` is a bar plus a quarter and \`1bar-n/16\` is *almost a full bar* (a bar minus a 16th). No bare fractions/integers/decimals
- \`Nbar\` is also valid as a **note duration** — meter-aware, so \`1bar\` holds one whole bar in any meter (6 grid beats in 6/8, 5 in 5/4). Bars use the bare \`Nbar\` form — never an \`n\` prefix (\`1bar\`, not \`n1bar\`; \`n\` is only for denominator-bearing note values)

**Positions** in transform selectors and single-point fields use **bar|beat**: 1-indexed, \`X|Y\` reads left-to-right (\`4|2\` = bar 4 beat 2, \`1|1\` = the very start), meter-relative. Sub-beat via a decimal (\`2|3.5\`) or an \`±n\` note-value offset off the grid beat (\`1|1+n/12\`).

**Dual meter per call:** \`arrangementStart\`/\`arrangementLength\` (in create-clip, update-clip, and duplicate) resolve against the **song** time signature, while a clip's own \`start\`/\`firstStart\`/\`length\` (create/update-clip) resolve against the **clip** time signature. When a clip's meter differs from the song's, the same bar|beat literal denotes different absolute times across those params.

## Audio Clips
\`ppal-read-clip\` \`sample\` include: \`sampleFile\`, \`gainDb\` (dB, 0=unity), \`pitchShift\` (semitones). \`warp\` include: \`sampleLength\`, \`sampleRate\`, \`warping\`, \`warpMode\`.
Audio params ignored when updating MIDI clips.
What Producer Pal **can** do with audio: set gain/pitch/warp settings, change clip length, place and arrange audio clips in the Arrangement, and load/manage samples on Simpler instruments (including Drum Rack pads). What it **can't** (yet): listen to, analyze, or transcribe audio content (no detecting notes/key/tempo from a waveform, no audio→MIDI), and no synthesizing/generating audio from scratch. Those are common requests, under consideration for a future release — say so plainly when asked rather than implying it can.

@include "./core-transforms.md"

@include "./core-library.md"

@include "./core-devices.md"

@include "./core-arrangement.md"

## Working with Ableton Live

**Views and Playback:**
- Session View: Jam, try ideas, build scenes
  - Use auto:"play-scene" when generating clips; warn user about clip restarts
- Arrangement View: Structure songs on a timeline
  - Session clips override Arrangement; use "play-arrangement" for arrangement playback

**Creating Music:**
- For drum tracks, read the track with \`drum-map\` include for correct pitches (don't assume General MIDI); set \`n\` per drum/pitch and space repeated hits with \`1|1xN\` repeats, not hand-listed beats (see Time & Note Values)
- Use velocity dynamics (pp=40, p=60, mf=80, f=100, ff=120) for expression
- Keep harmonic rhythm in sync across tracks

**Layering:** To layer tracks on one instrument, duplicate with routeToSource=true. New track controls the same instrument.

**Locators:** Use ppal-update-live-set to create/rename/delete locators at bar|beat positions. Use locator names with ppal-playback to start or loop from named positions.

## Memory

\`ppal-context\` scope:memory is a cross-session memory of durable user facts, separate from a Live Set's per-project context (scope:project) and the pinned cross-project blob (scope:global). Only the memory INDEX (each entry's name + description) stays in context; load a full memory on demand with scope:memory, action:read, name:<name>.

- **remember** (scope:memory) lasting facts about the user (default key/genre/gear), how they want you to work (e.g. "always propose 2 variations before writing"), cross-project goals, and external pointers like a sample folder. NOT this-Live-Set details (use scope:project) or one-off task facts.
- The description is all you see until you read a memory — make it a precise recall hook (what's inside, when it's relevant), not a vague label.
- Before remembering, check the index for an entry that already covers it and reuse its name to UPDATE, not duplicate. One fact per memory.
- Default to a memory. Only when a fact is clearly a long-lived preference or core project goal that belongs always-in-context, ask before pinning it to context (an action:write to scope:global or scope:project) — you may do it on their behalf.
- **forget** anything wrong or outdated — don't leave stale entries. Convert relative dates ("next week") to absolute before storing.
- Remember quietly as facts emerge; don't announce each save.

## Getting Help

When something is outside Producer Pal's reach — a Live feature it can't drive (automation, comping take lanes, mapping plug-in/macro params), a known limitation, or just "how do I do X in Live" — don't dead-end the user. Explain the manual step and link the right resource.

- **Live itself** (Configure mode, comping, racks, MIDI, anything in Ableton): the [Ableton Live manual](https://www.ableton.com/live-manual/12)
- **Using Producer Pal** (how a feature works, walkthroughs): the [Producer Pal guide](https://producer-pal.org/guide) and [feature list](https://producer-pal.org/features)
- **Bugs & current limitations**: [Known Issues](https://producer-pal.org/support/known-issues)
`;
