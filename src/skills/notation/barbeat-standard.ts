// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export const barbeatStandardNotation = `## Time & Note Values

**Units:** a plain "beat" is your meter's beat — the *musical beat* (a quarter in x/4, an eighth in x/8). It's what the bar|beat grid, sub-beat decimals, and bare numbers in transform expressions count. **Note values** (\`n/4\`, \`n/8\`, \`±n\` offsets, durations, \`@step\`) are absolute and meter-invariant: a quarter is a quarter in any meter. \`Nbar\` = N of your meter's bars. (Live's internal API unit is the quarter-note "Ableton beat"; you never write it directly.) Bare numbers are valid ONLY in transform expressions — position/duration/length/offset fields require the \`n\` form.

**Dual meter per call:** \`arrangementStart\`/\`arrangementLength\` (in create-clip, update-clip, and duplicate) resolve against the **song** time signature, while a clip's own \`start\`/\`firstStart\`/\`length\` (create/update-clip) resolve against the **clip** time signature. When a clip's meter differs from the song's, the same bar|beat literal denotes different absolute times across those params.

- Positions: bar|beat — reads left-to-right like the name: \`4|2\` is bar 4 beat 2, \`2|4\` is bar 2 beat 4. 1-indexed, meter-relative grid. For one note per bar, step the LEFT number (\`1|1 2|1 3|1 4|1\`); to move within a bar, step the right number. Sub-beat placement has two tools for two jobs: a **decimal** (\`2|3.5\`) for *partway through a beat* (a fraction of the musical beat), and a **\`±n\` offset** (\`1|1+n/12\` = beat 1 + an eighth triplet, \`1|2-n/24\`) for an *exact note value* off the grid beat (tuplets, compound-meter placement). The offset attaches to an integer **or decimal** grid beat — \`1|1.5+n/4\` is beat 1.5 plus a quarter. They coincide only in x/4 — see the meter note below. A \`-n\` offset can pull *before* a downbeat for a **pickup**: \`1|1-n/4\` is a quarter-note pickup ahead of bar 1 (it lands before the clip start, which Live allows); use \`n/8\`, \`n/12\`, etc. for the lead-in you want. Serialized output uses the exact \`±n\` form for tuplet positions. No bare fractions (beats are 1-indexed — beat 0 is invalid; use a \`-n\` pickup instead)
- Durations and \`@step\` intervals: absolute note values (denominator mandatory). \`n/4\` = quarter, \`n/8\` = eighth, \`n/16\` = sixteenth, \`n/12\` = eighth triplet (3 in a quarter), \`n3/8\` = dotted quarter (3 eighths). A quarter is a quarter in any meter
- Clip \`length\` and arrangement durations: \`Nbar\` (meter-aware, e.g. \`4bar\`), \`n<fraction>\` note value (e.g. \`n/4\` = quarter, \`n/8\` = eighth), or \`Nbar±n<fraction>\` mixed — the tail adds or subtracts, so \`1bar+n/4\` is a bar plus a quarter and \`1bar-n/16\` is *almost a full bar* (a bar minus a 16th). Same \`n\` fraction grammar everywhere. No bare fractions/integers/decimals
- \`Nbar\` is also valid as a **note duration** — meter-aware, so \`1bar\` holds one whole bar in any meter (6 grid beats in 6/8, 5 in 5/4). Use it for a single bar-length note; for several notes filling a bar, use a repeat instead (below). Bars use the bare \`Nbar\` form — never an \`n\` prefix (\`1bar\`, not \`n1bar\`; \`n\` is only for denominator-bearing note values)

**In meters other than x/4, the grid beat is NOT a quarter** (in 6/8 it's an eighth), so consecutive grid beats are not one note value apart. To place notes a fixed note value apart — e.g. fill a bar with quarter notes — use a repeat pattern \`1|1x<count>\` with a real number for \`<count>\` (its step defaults to the current duration, which is meter-safe), not hand-enumerated grid beats: in 6/8, \`n/4 C1 1|1x3\` lands quarters on grid beats 1, 3, 5 (filling the bar), and in 5/4 \`n/4 C1 1|1x5\` fills the bar, while \`n/4 C1 1|1,2,3\` is consecutive *eighths* in 6/8 (wrong). Same trap for decimals: in 6/8 \`1|1.5\` is half an eighth, \`1|1+n/8\` a full eighth.

## MIDI Syntax

Create MIDI clips using the bar|beat notation syntax:

\`v0-127 n<duration> [p0-1] note(s) bar|beat(s)\`

**Alternative — MIDI JSON:** notation is a global setting (default bar|beat), chosen in the device Settings — not a per-call argument. When it is set to MIDI JSON, the \`notes\` argument (and read-clip's returned notes) is a compact array-of-objects string instead of bar|beat: \`[{p:60,t:0,d:4,v:100},{p:62,t:1,d:1,v:90,vd:10,c:0.75}]\`. Keys: \`p\` pitch 0-127, \`t\` start and \`d\` duration in musical beats, \`v\` velocity 1-127, optional \`vd\` velocity-deviation 0-127 (default 0) and \`c\` probability/chance 0-1 (default 1) — omit \`vd\`/\`c\` at their defaults. MIDI JSON has no \`v0\`-delete — use \`preTransforms\` to delete existing notes.

**Alternative — Abstark:** another global notation (device Settings). A literal, round-trippable format; like MIDI JSON it replaces the bar|beat \`notes\` string (read and write) when selected. One line per part, \`type: content\`:
- **Drums** — \`kick: X.X. ....\` Each character is one 16th-note step (positional grid): \`^\`=accent, \`X\`=normal, \`x\`=soft, \`.\`=rest. Whitespace groups visually and \`|\` is a visual barline — neither advances time. Drum names (General MIDI 16-pad layout, notes 36-51): kick snare snare2 hihat pedal open tom1 tom2 tom3 tom4 ride crash clap rimshot perc1 perc2 (toms run high→low; perc1/perc2 are the variable upper pads). A pad with no name uses an absolute pitch-name header instead (\`C3: X...\`, Ableton C3=60) — same content syntax.
- **Pitched** — \`melody: C Eb G'\` (also \`bass:\`, \`chords:\`). Event-based: whitespace has NO rhythmic meaning. A token is letter \`A\`-\`G\` + optional \`#\`/\`b\` (immediately after the letter, so \`Cb\`=C-flat but a lone \`b\`=note B) + octave marks (\`'\` up, \`,\` down, stackable) + duration \`/N\` + dynamic (\`!\`=accent, \`?\`=soft, omit=normal). \`/N\` is an ABSOLUTE note value: \`/1\`=whole (4 beats), \`/2\`=half, \`/4\`=quarter (1 beat), \`/8\`, \`/16\`. Rest = \`z\` or \`z/N\`. Default duration is \`/4\` for bass/melody, \`/1\` for chords; set a line default in the header (\`melody/8: ...\`).
- **Registers** (the MIDI pitch \`C\` maps to): bass=C2, melody=C4, chords=C3; octave marks shift from there.
- **Chords** — \`chords: [C Eb G]/2!\` the bracket's notes share its \`/N\` duration and dynamic.

- v/n/p are prefixes — they apply to the pitches that follow. Vary per pitch by interspersing: \`v80 C4 v90 G4\` (C4 at 80, G4 at 90)
- Notes emit at time positions (bar|beat)
  - time positions are relative to clip start
  - the beat in bar|beat can be a comma-separated list or repeat pattern. Spaces after commas are fine, and a list item may restate its own \`bar|\` — that bar then sticks for the following bare items (\`1|1,2|1,3\` = \`1|1 2|1 2|3\`)
  - **Repeat patterns**: \`{bar|beat}x{count}[@{step}]\` generates sequences. count = how many notes
    - \`@step\` uses the same note-value form as \`n\` — \`@n/4\`, \`@1bar\` (bare \`@/4\` or \`@1\` is invalid). Defaults to the current duration (legato)
    - \`1|1x4@n/4\` → 4 notes a quarter apart; \`n/8 1|1x4\` → 4 eighths (step defaults to n value)
    - \`1|1x3@n/12\` → eighth-note triplets (3 in a quarter); \`n/16 1|1x16\` → 16 sixteenths spanning 4 quarters (a full bar in 4/4)
    - **Prefer repeats over hand-listing beats for evenly-spaced notes** — the step is a note value, so spacing stays correct in any meter (see Time & Note Values for the meter trap this avoids)
    - **Pattern brackets** \`[...]\`: a *cycle* of one parameter's values, stepped across notes instead of repeated. **Pitch**: \`[C3 E3 G3] 1|1x3@n/4\` (or across separate beats, \`[C3 E3 G3] 1|1 1|2 1|3\`) plays C3, E3, G3 (a melodic line, not 3× one pitch); \`(...)\` is a chord step (\`[(C3 E3) (D3 F3)] 1|1x2@n/4\`). Multiple pitch brackets (or a bare pitch + a bracket) **layer** into chords: \`C4 [E4 G4 C5] 1|1,2,3,4\` is a held C4 under a moving line; \`[C3 C4] [E3 G3 E4] 1|1,2,3,4\` stacks two voices that phase (only pitch layers — v/n/p are last-wins). **Velocity/duration/probability**: \`[v100 v60]\`, \`[n/4 n/8]\`, \`[p1 p0.5]\` cycle that value (e.g. \`[v100 v60 v60 v60] C1 1|1x16@n/16\` = accent every 4th hat). A duration bracket with **no** \`@step\` also sets the spacing — the notes gallop (\`[n/4 n/8] C3 1|1x8\` = long-short long-short). One kind per bracket. **Zip** sibling brackets to vary several at once against the same step: \`[v80 v100] [C3 E3 G3] 1|1x8@n/8\` → eight 8th notes C3 v80, E3 v100, G3 v80, C3 v100, E3 v80, G3 v100, C3 v80, E3 v100 (velocity cycles every 2, pitch every 3 — coprime lengths phase against each other). Each cycle wraps at its own length and persists until you reassign that parameter
- v<velocity>: 0-127 (default: v100). Range v80-120 randomizes per note for humanization (low bound ≥1; \`v0-N\` is an error — v0 is the delete sentinel, not a range floor)
  - \`v0\` deletes earlier notes at same pitch/time (**deletes until disabled** with non-zero v)
- n<duration>: Note length as an absolute note value. **Set it explicitly rather than relying on the \`n/4\` default** — and because it's stateful, re-set it whenever the intended length changes. It applies to notes **after** it — put the \`n\` change *before* the note it should affect (\`n/8 G3 4|2 A3\`, not \`G3 4|2 n/8 A3\`, which leaves G3 at the old length and overlaps A3). For drums, set \`n\` at the start and again for each drum/pitch (a hat's \`n/16\` otherwise carries over to the next kick). REQUIRES denominator — \`n1\`, \`n2.5\`, \`n0.5\` are invalid; write \`n/4\`, \`n5/8\`, \`n/8\`. \`n/12\` = eighth triplet (3 in a quarter), \`n/6\` = quarter triplet (3 in a half)
- p<chance>: Probability from 0.0 to 1.0 (default: 1.0 = always). Opt-in — if any note uses probability, set it on every note (a stray p otherwise rides along)
- Notes: C0-G8 with # or b for sharps/flats (C#3, Bb2; case-insensitive). C3 = middle C
- **Shortcut (stateful)**: omit any of v/n/p to reuse its last value — they don't reset per note, so re-state one whenever it should change. v/n/p and pitch persist until changed
- **Same-pitch overlap**: two notes of the same pitch can't sound at once — if one's length runs into the next same-pitch note, Live truncates the earlier to end where the next starts. Both are kept (authored notes aren't dropped for overlapping); same pitch *and* start collapses to one
- copying bars (**MERGES** - use v0 to clear unwanted notes):
  - @N= copies previous bar; @N=M copies bar M to N; @N-M=P copies bar P to range
  - @N-M=P-Q tiles bars P-Q across range; @clear clears copy buffer
  - Copies capture each note's v/n/p at the time it was written, not the current state

### Editing Existing Notes (update-clip)

\`notes\` MERGES into an existing clip — a new note overwrites the existing note at the *same* pitch+start (restate \`n/8 G3 4|2\` to shorten that G3); other notes are untouched. So **don't rewrite the whole clip to change a few notes** — restate just those. To delete, move, clear a region, or otherwise change notes *already* in the clip, use \`preTransforms\` (see Transforms) — to *replace* a region rather than edit in place, clear it first (\`preTransforms: "1|1-2|1: delete"\`) or the notes you didn't restate stay behind.

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
v90-110 n/4 C1 1|1,3 n/8 D1 1|2,4 // humanized drums — re-set n per lane
n/16 Gb1 1|1,1.5,2,2.5 n/4 C1 1|1 // re-set n/4 for kick, else hat's n/16 leaks onto it
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

Copy foundation to **all bars** (including variation bars), then modify:

\`\`\`
C1 1|1,3 D1 1|2,4       // bar 1 foundation
Gb1 1|1.5,2.5,3.5,4.5
@2-16=1                 // copy to ALL bars, not just 2-8
v0 Gb1 9|4.5 v100       // remove hat from bar 9
C1 9|3.5                // add extra kick to bar 9
v0 C1 13|3 v100 D1 13|3 // replace kick with snare in bar 13
\`\`\``;
