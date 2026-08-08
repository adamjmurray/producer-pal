// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * bar|beat standard notation head, in two halves. The notation-neutral note-value
 * / `Nbar` / dual-meter grammar lives in the `time-and-values` fragment (shared
 * by every notation's transforms and length fields); the `standard` driver's
 * manifest orders all three — `resolveIncludes` composes them, buildSkills glues
 * nothing.
 *
 * The split is by DIRECTION, so a caller with only the read tools stops paying
 * for the authoring guide (see ADR-0019). {@link barbeatStandard} keeps the base
 * slot name and holds what reading a clip needs — the positions grammar and the
 * `v/n/p pitch bar|beat` shape the serializer actually emits;
 * {@link barbeatStandardWrite} is the sibling gated on the two clip writers,
 * holding the authoring sugar (brackets, bar copies, `v0`) a read-back never
 * contains, plus the advice on when to reach for a repeat.
 *
 * Repeats are the exception the seam has to respect: the drum serializer emits
 * `1|1x16`, so the read half defines what `xN@step` MEANS even though only a
 * writer can choose to author one. Don't move that definition across.
 *
 * The seam runs by whole bullet/section, NOT by trimming sentences inside the
 * v/n/p bullets: a mis-sorted line degrades either reading or writing with
 * nothing to catch it, so the ambiguous lines stay on the read side where both
 * audiences get them. Two places needed real rewriting rather than moving, and
 * they are where a regression would show up first — the meter paragraph below
 * (its "use a repeat pattern instead" prescription moved, its meter FACT stayed)
 * and the comma-list bullet (its "or repeat pattern" clause became the repeat
 * bullet under it, restated by the write half's lead-in).
 */
export const barbeatStandard = `## Positions & Meter

- Positions: bar|beat — reads left-to-right like the name: \`4|2\` is bar 4 beat 2, \`2|4\` is bar 2 beat 4. 1-indexed, meter-relative grid. For one note per bar, step the LEFT number (\`1|1 2|1 3|1 4|1\`); to move within a bar, step the right number. Sub-beat placement has two tools for two jobs: a **decimal** (\`2|3.5\`) for *partway through a beat* (a fraction of the musical beat), and a **\`±n\` offset** (\`1|1+n/12\` = beat 1 + an eighth triplet, \`1|2-n/24\`) for an *exact note value* off the grid beat (tuplets, compound-meter placement). The offset attaches to an integer **or decimal** grid beat — \`1|1.5+n/4\` is beat 1.5 plus a quarter. They coincide only in x/4 — see the meter note below. A \`-n\` offset can pull *before* a downbeat for a **pickup**: \`1|1-n/4\` is a quarter-note pickup ahead of bar 1 (it lands before the clip start, which Live allows); use \`n/8\`, \`n/12\`, etc. for the lead-in you want. Serialized output uses the exact \`±n\` form for tuplet positions. No bare fractions (beats are 1-indexed — beat 0 is invalid; use a \`-n\` pickup instead). See **Time & Note Values** for note values (\`n/4\`, \`Nbar\`)

**In meters other than x/4, the grid beat is NOT a quarter** (in 6/8 it's an eighth), so consecutive grid beats are not one note value apart: in 6/8, \`1|1,2,3\` is three consecutive *eighths*, not quarters. Same trap for decimals: in 6/8 \`1|1.5\` is half an eighth, \`1|1+n/8\` a full eighth.

## MIDI Syntax

MIDI clip notes use the bar|beat notation syntax:

\`v0-127 n<duration> [p0-1] note(s) bar|beat(s)\`

- v/n/p are prefixes — they apply to the pitches that follow. Vary per pitch by interspersing: \`v80 C4 v90 G4\` (C4 at 80, G4 at 90)
- Notes emit at time positions (bar|beat)
  - time positions are relative to clip start
  - the beat in bar|beat can be a comma-separated list. Spaces after commas are fine, and a list item may restate its own \`bar|\` — that bar then sticks for the following bare items (\`1|1,2|1,3\` = \`1|1 2|1 2|3\`)
  - the beat can also be a **repeat pattern** \`{bar|beat}x{count}[@{step}]\`: \`count\` notes from that position, \`@step\` apart. \`@step\` is a note value (\`@n/4\`, \`@1bar\`) and defaults to the current \`n\`, so \`n/16 Gb1 1|1x16\` is 16 sixteenths from bar 1 beat 1. Clips on a Drum Rack track read back in this form
- v<velocity>: 0-127 (default: v100). Range v80-120 randomizes per note for humanization (low bound ≥1; \`v0-N\` is an error — v0 is the delete sentinel, not a range floor)
- n<duration>: Note length as an absolute note value (default \`n/4\`). \`n\` is **stateful** — it carries until changed and applies to notes **after** it, so put the \`n\` change *before* the note it should affect (\`n/8 G3 4|2 A3\`, not \`G3 4|2 n/8 A3\`, which leaves G3 at the old length). Length matters for sustained/melodic notes (it *is* the articulation); for one-shot drums a carried length is usually inaudible, so re-set \`n\` only when the intended length actually changes. REQUIRES denominator — \`n1\`, \`n2.5\`, \`n0.5\` are invalid; write \`n/4\`, \`n5/8\`, \`n/8\`. \`n/12\` = eighth triplet (3 in a quarter), \`n/6\` = quarter triplet (3 in a half). A \`d\`/\`t\` suffix is a shortcut for dotted/triplet: \`n/4d\` = dotted quarter (= \`n3/8\`), \`n/8t\` = eighth triplet (= \`n/12\`) — see **Time & Note Values**
- p<chance>: Probability from 0.0 to 1.0 (default: 1.0 = always). Opt-in — if any note uses probability, set it on every note (a stray p otherwise rides along)
- Notes: C0-G8 with # or b for sharps/flats (C#3, Bb2; case-insensitive). C3 = middle C
- **Shortcut (stateful)**: omit any of v/n/p to reuse its last value — they don't reset per note, so re-state one whenever it should change. v/n/p and pitch persist until changed
- **Same-pitch overlap**: two notes of the same pitch can't sound at once — if one's length runs into the next same-pitch note, Live truncates the earlier to end where the next starts. Both are kept (authored notes aren't dropped for overlapping); same pitch *and* start collapses to one`;

/**
 * bar|beat authoring half: the syntax only `ppal-create-clip` / `ppal-update-clip`
 * can act on. Gated on those two, so a read-only caller never receives it — the
 * serializer emits none of this, so a read-back provably never contains it.
 *
 * Opens on repeats — the read half defines the form (the serializer emits it), so
 * this half only adds the authoring gotchas and when to prefer one.
 *
 * Says nothing about editing a clip that already has notes: that is update-clip's
 * alone, and this fragment also ships to a create-clip-only caller, which
 * replaces a slot rather than merging into it. It lives in `transforms-editing`,
 * whose gate is exactly update-clip. Don't name `preTransforms` here — that is
 * the dangling-vocabulary bug the move fixed.
 */
export const barbeatStandardWrite = `## Writing Notes

More on **repeat patterns**, plus **pattern brackets** for v/n/p/pitch:

- **Repeat patterns** \`{bar|beat}x{count}[@{step}]\`: a bare \`@/4\` or \`@1\` is invalid — \`@step\` takes the same note-value form as \`n\` (\`@n/4\`, \`@1bar\`). Letting it default gives legato: \`n/8 1|1x4\` → 4 eighths back-to-back. \`1|1x3@n/12\` → eighth-note triplets (3 in a quarter)
  - **Prefer repeats over hand-listing beats for evenly-spaced notes** — the step is a note value, so spacing stays correct in any meter. To place notes a fixed note value apart — e.g. fill a bar with quarter notes — give \`<count>\` a real number instead of enumerating grid beats: in 6/8, \`n/4 C1 1|1x3\` lands quarters on grid beats 1, 3, 5 (filling the bar), and in 5/4 \`n/4 C1 1|1x5\` fills the bar (see **Positions & Meter** for the meter trap this avoids)
- **Pattern brackets** \`[...]\`: a *cycle* of one parameter's values, stepped across notes instead of repeated. **Pitch**: \`[C3 E3 G3] 1|1x3@n/4\` (or across separate beats, \`[C3 E3 G3] 1|1 1|2 1|3\`) plays C3, E3, G3 (a melodic line, not 3× one pitch); \`(...)\` is a chord step (\`[(C3 E3) (D3 F3)] 1|1x2@n/4\`). Multiple pitch brackets (or a bare pitch + a bracket) **layer** into chords: \`C4 [E4 G4 C5] 1|1,2,3,4\` is a held C4 under a moving line; \`[C3 C4] [E3 G3 E4] 1|1,2,3,4\` stacks two voices that phase (only pitch layers — v/n/p are last-wins). **Velocity/duration/probability**: \`[v100 v60]\`, \`[n/4 n/8]\`, \`[p1 p0.5]\` cycle that value (e.g. \`[v100 v60 v60 v60] C1 1|1x16@n/16\` = accent every 4th hat). A duration bracket with **no** \`@step\` also sets the spacing — the notes gallop (\`[n/4 n/8] C3 1|1x8\` = long-short long-short). One kind per bracket. **Zip** sibling brackets to vary several at once against the same step: \`[v80 v100] [C3 E3 G3] 1|1x8@n/8\` → eight 8th notes C3 v80, E3 v100, G3 v80, C3 v100, E3 v80, G3 v100, C3 v80, E3 v100 (velocity cycles every 2, pitch every 3 — coprime lengths phase against each other). Each cycle wraps at its own length and persists until you reassign that parameter
- \`v0\` deletes earlier notes at the same pitch/time — **sticky** like any \`v\` (keeps deleting until you set a non-zero \`v\`). Reserve it for notes built in this same \`notes\` string; \`delete\` is a transforms keyword, not a \`notes\` token. Always follow an inline \`v0\` with \`vN\` (N>0) to exit delete state
- copying bars (**MERGES** - clear unwanted notes with a sticky inline \`v0\`, or with \`transforms\` \`delete\`):
  - @N= copies previous bar; @N=M copies bar M to N; @N-M=P copies bar P to range
  - @N-M=P-Q tiles bars P-Q across range; @clear clears copy buffer
  - Copies capture each note's v/n/p at the time it was written, not the current state

## Examples

\`\`\`
C#3 F3 G#3 1|1 // chord at bar 1 beat 1
C3 E3 G3 1|1,2,3,4 // same chord on every beat
C1 1|1,3 2|1,2,3 // same pitch across bars (1|1,3,2|1,2,3 also works — the bar| sticks)
n/16 C3 1|1.75 // 16th note at beat 1.75
n/12 C3 1|1 E3 1|1+n/12 G3 1|1+n/6 // eighth-triplet arp C-E-G on beat 1 (varying pitch → ±n offsets, not a repeat)
n/12 C3 1|1x3 // eighth-note triplets: 3 notes filling one quarter (step = duration)
n/16 Gb1 1|1x16 // 16 sixteenths = 4 quarters, a full bar in 4/4 (1|1x16@n/16 is the same)
[C3 E3 G3 C4] 1|1x4@n/4 // melodic line: C3,E3,G3,C4 on 4 quarters (pitch bracket steps the list, not 4× one pitch)
C3 D3 1|1 v0 C3 1|1 // delete earlier C3 (D3 remains)
C3 D3 1|1 @2=1 v0 D3 2|1 // bar copy then delete D3 from bar 2
v90-110 n/4 C1 1|1,3 n/8 D1 1|2,4 // humanized drums — n re-set per lane
p0.5 n/4 C1 1|1,2,3,4 // 50% chance each kick plays
\`\`\`

### Bar Copying

Complete bars before copying. Use beat lists for irregular patterns.

\`\`\`
C1 1|1,3 D1 1|2,4 // bar 1
@2-3=1            // bar 1 -> 2,3
C1 4|1,3.5 D1 4|4 // bar 4
@5-7=1            // bar 1 -> 5,6,7
@8=4              // bar 4 -> 8
\`\`\`

### Repeats with Variations

Copy foundation to **all bars** (including variation bars), then modify. \`v0\` is sticky, so each is followed by \`vN\` (N>0) to exit delete state:

\`\`\`
C1 1|1,3 D1 1|2,4       // bar 1 foundation
Gb1 1|1.5,2.5,3.5,4.5
@2-16=1                 // copy to ALL bars, not just 2-8
v0 Gb1 9|4.5 v100       // remove hat from bar 9 (v100 exits delete state)
C1 9|3.5                // add extra kick to bar 9
v0 C1 13|3 v100 D1 13|3 // replace kick w/ snare in bar 13 (v100 exits delete + sets D1)
\`\`\``;
