// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

const codeTransformsSkills = `

### Code Transforms

For complex logic beyond transforms, use the \`code\` parameter with JavaScript. \`code\` is a single string (function body only), broadcast across every clip/copy. It runs as:
\`(function(notes, context) { <code> })(notes, context)\`

For per-clip variation, branch on \`context.clip.index\` (0-based) and \`context.clip.count\` (batch size). For structurally-distinct edits per clip, make separate tool calls.

Example \`code\`:
\`\`\`javascript
return notes.filter(n => n.pitch >= 60).map(n => ({
  ...n,
  velocity: Math.min(127, n.velocity + 20 + context.clip.index * 5)
}));
\`\`\`

All times are musical beats (the meter's beat — an eighth in 6/8), matching \`beatsPerBar\`; \`start / beatsPerBar\` is the bar offset in any meter.

**Note properties (required: pitch, start):**
- \`pitch\`: 0-127 (60 = C3)
- \`start\`: musical beats from clip start
- \`duration\`: musical beats (default: 1)
- \`velocity\`: 1-127 (default: 100)
- \`velocityDeviation\`: 0-127 (default: 0)
- \`probability\`: 0-1 (default: 1)

**Context properties:**
- \`track\`: { index, name, type, color }
- \`clip\`: { id, name, length, timeSignature, looping, index, count } (length in musical beats)
- \`location\`: { view, slot?, arrangementStart? }
- \`liveSet\`: { tempo, scale?, timeSignature }
- \`beatsPerBar\`: number (musical beats per bar)

**Processing order:** notes → transforms → code. When \`notes\` and \`code\` are both provided, notes are parsed and transforms applied first. Code then receives those notes and can further transform them.
`;

export const skills = `# Producer Pal Skills

## Time in Ableton Live

**Units:** a plain "beat" is your meter's beat — the *musical beat* (a quarter in x/4, an eighth in x/8). It's what the bar|beat grid, sub-beat decimals, and bare numbers in transform expressions count. **Note values** (\`n/4\`, \`n/8\`, \`±n\` offsets, durations, \`@step\`) are absolute and meter-invariant: a quarter is a quarter in any meter. \`Nbar\` = N of your meter's bars. (Live's internal API unit is the quarter-note "Ableton beat"; you never write it directly.) Bare numbers are valid ONLY in transform expressions — position/duration/length/offset fields require the \`n\` form.

**Dual meter per call:** \`arrangementStart\`/\`arrangementLength\` (in create-clip, update-clip, and duplicate) resolve against the **song** time signature, while a clip's own \`start\`/\`firstStart\`/\`length\` (create/update-clip) resolve against the **clip** time signature. When a clip's meter differs from the song's, the same bar|beat literal denotes different absolute times across those params.

- Positions: bar|beat — reads left-to-right like the name: \`4|2\` is bar 4 beat 2, \`2|4\` is bar 2 beat 4. 1-indexed, meter-relative grid. For one note per bar, step the LEFT number (\`1|1 2|1 3|1 4|1\`); to move within a bar, step the right number. Sub-beat placement has two tools for two jobs: a **decimal** (\`2|3.5\`) for *partway through a beat* (a fraction of the musical beat), and a **\`±n\` offset** (\`1|1+n/12\` = beat 1 + an eighth triplet, \`1|2-n/24\`) for an *exact note value* off the grid beat (tuplets, compound-meter placement). They coincide only in x/4 — see the meter note below. Serialized output uses the exact \`±n\` form for tuplet positions. No bare fractions
- Durations and \`@step\` intervals: absolute note values (denominator mandatory). \`n/4\` = quarter, \`n/8\` = eighth, \`n/16\` = sixteenth, \`n/12\` = eighth triplet (3 in a quarter), \`n3/8\` = dotted quarter (3 eighths). A quarter is a quarter in any meter
- Clip \`length\` and arrangement durations: \`Nbar\` (meter-aware, e.g. \`4bar\`), \`n<fraction>\` note value (e.g. \`n/4\` = quarter, \`n/8\` = eighth), or \`Nbar+n<fraction>\` mixed (e.g. \`1bar+n/4\`). Same \`n\` fraction grammar everywhere. No bare fractions/integers/decimals
- \`Nbar\` is also valid as a **note duration** — meter-aware, so \`1bar\` holds one whole bar in any meter (6 grid beats in 6/8, 5 in 5/4). Use it for a single bar-length note; for several notes filling a bar, use a repeat instead (below). Bars use the bare \`Nbar\` form — never an \`n\` prefix (\`1bar\`, not \`n1bar\`; \`n\` is only for denominator-bearing note values)

**In meters other than x/4, the grid beat is NOT a quarter** (in 6/8 it's an eighth), so consecutive grid beats are not one note value apart. To place notes a fixed note value apart — e.g. fill a bar with quarter notes — use a repeat pattern \`1|1x<count>\` with a real number for \`<count>\` (its step defaults to the current duration, which is meter-safe), not hand-enumerated grid beats: in 6/8, \`n/4 C1 1|1x3\` lands quarters on grid beats 1, 3, 5 (filling the bar), and in 5/4 \`n/4 C1 1|1x5\` fills the bar, while \`n/4 C1 1|1,2,3\` is consecutive *eighths* in 6/8 (wrong). Same trap for decimals: in 6/8 \`1|1.5\` is half an eighth, \`1|1+n/8\` a full eighth.

## MIDI Syntax

Create MIDI clips using the bar|beat notation syntax:

\`v0-127 n<duration> [p0-1] note(s) bar|beat(s)\`

- v/n/p are prefixes — they apply to the pitches that follow. Vary per pitch by interspersing: \`v80 C4 v90 G4\` (C4 at 80, G4 at 90)
- Notes emit at time positions (bar|beat)
  - time positions are relative to clip start
  - the beat in bar|beat can be a comma-separated (no whitespace) list or repeat pattern
  - **Repeat patterns**: \`{bar|beat}x{count}[@{step}]\` generates sequences. count = how many notes
    - \`@step\` uses the same note-value form as \`n\` — \`@n/4\`, \`@1bar\` (bare \`@/4\` or \`@1\` is invalid). Defaults to the current duration (legato)
    - \`1|1x4@n/4\` → 4 notes a quarter apart; \`n/8 1|1x4\` → 4 eighths (step defaults to n value)
    - \`1|1x3@n/12\` → eighth-note triplets (3 in a quarter); \`n/16 1|1x16\` → 16 sixteenths spanning 4 quarters (a full bar in 4/4)
    - **Prefer repeats over hand-listing beats for evenly-spaced notes** — the step is a note value, so spacing stays correct in any meter (in 6/8, \`n/4 C1 1|1x3\` = quarters on beats 1, 3, 5; \`1|1,2,3\` would be eighths)
    - **Pattern brackets** \`[...]\`: a *stream* of one parameter's values, cycled across notes instead of repeated. **Pitch**: \`[C3 E3 G3] 1|1x3@n/4\` (or across separate beats, \`[C3 E3 G3] 1|1 1|2 1|3\`) plays C3, E3, G3 (a melodic line, not 3× one pitch); \`(...)\` is a chord step (\`[(C3 E3) (D3 F3)] 1|1x2@n/4\`). **Velocity/duration/probability**: \`[v100 v60]\`, \`[n/4 n/8]\`, \`[p1 p0.5]\` cycle that value (e.g. \`[v100 v60 v60 v60] C1 1|1x16@n/16\` = accent every 4th hat). A duration bracket with **no** \`@step\` also sets the spacing — the notes gallop (\`[n/4 n/8] C3 1|1x8\` = long-short long-short). One kind per bracket. **Zip** sibling brackets to vary several at once against the same step: \`[v80 v100] [C3 E3 G3] 1|1x8@n/8\`. Each stream cycles by its own length and persists until you reassign that parameter
- v<velocity>: 0-127 (default: v100). Range v80-120 randomizes per note for humanization (start the low bound ≥1: \`v0-N\` sets a base velocity of 0, which triggers the v0 delete and drops the notes)
  - \`v0\` deletes earlier notes at same pitch/time (**deletes until disabled** with non-zero v)
- n<duration>: Note length as an absolute note value. **Set it explicitly rather than relying on the \`n/4\` default** — and because it's stateful, re-set it whenever the intended length changes. It applies to notes **after** it — put the \`n\` change *before* the note it should affect (\`n/8 G3 4|2 A3\`, not \`G3 4|2 n/8 A3\`, which leaves G3 at the old length and overlaps A3). For drums, set \`n\` at the start and again for each drum/pitch (a hat's \`n/16\` otherwise carries over to the next kick). REQUIRES denominator — \`n1\`, \`n2.5\`, \`n0.5\` are invalid; write \`n/4\`, \`n5/8\`, \`n/8\`. \`n/12\` = eighth triplet (3 in a quarter), \`n/6\` = quarter triplet (3 in a half)
- p<chance>: Probability from 0.0 to 1.0 (default: 1.0 = always). Opt-in — if any note uses probability, set it on every note (a stray p otherwise rides along)
- Notes: C0-G8 with # or b for sharps/flats (C#3, Bb2). C3 = middle C
- **Shortcut (stateful)**: omit any of v/n/p to reuse its last value — they don't reset per note, so re-state one whenever it should change. v/n/p and pitch persist until changed
- **Same-pitch overlap**: two notes of the same pitch can't sound at once — if one's length runs into the next same-pitch note, Live truncates the earlier to end where the next starts. Both are kept (authored notes aren't dropped for overlapping); same pitch *and* start collapses to one
- copying bars (**MERGES** - use v0 to clear unwanted notes):
  - @N= copies previous bar; @N=M copies bar M to N; @N-M=P copies bar P to range
  - @N-M=P-Q tiles bars P-Q across range; @clear clears copy buffer
  - Copies capture each note's v/n/p at the time it was written, not the current state
- **Editing notes already in the clip** (update-clip): \`notes\` MERGES — a new note overwrites the existing note at the *same* pitch+start (restate \`n/8 G3 4|2\` to shorten that G3); other notes are untouched. So **don't rewrite the whole clip to change a few notes** — restate just those. To *replace* a region (not edit in place), clear it first with \`preTransforms\` (\`1|1-2|1: v0\`) or the notes you didn't restate stay behind. Use \`preTransforms\` (see Transforms) to delete, move, or shift pre-existing notes; a \`v0\` in \`notes\` only deletes notes built **within the same string** (inline sculpting after a bar copy)

## Audio Clips
\`ppal-read-clip\` \`sample\` include: \`sampleFile\`, \`gainDb\` (dB, 0=unity), \`pitchShift\` (semitones). \`warp\` include: \`sampleLength\`, \`sampleRate\`, \`warping\`, \`warpMode\`.
Audio params ignored when updating MIDI clips.

## Examples

\`\`\`
C#3 F3 G#3 1|1 // chord at bar 1 beat 1
C3 E3 G3 1|1,2,3,4 // same chord on every beat
C1 1|1,3 2|1,2,3 // same pitch across bars (NOT 1|1,3,2|1,2,3)
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

## Techniques

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
\`\`\`

### Transforms

Add \`transforms\` parameter to create-clip, update-clip, or duplicate.

**Shape:** a single string, broadcast across every clip/copy. Multiple expressions: newline-separated. Per-clip variation: \`clip.index\` arithmetic or \`clipseq()\` inside the string (below). Structurally-distinct edits per clip → separate tool calls.

**Syntax:** \`[selector:] parameter operator expression\` (one per line)
- **Selector:** pitch and/or time filter, followed by \`:\` - e.g., \`C3:\`, \`1|1-2|4:\`, \`C3 1|1-2|4:\`, \`1|1-2|4 C3:\`
- **Pitch filter:** \`C3\` (single) or \`C3-C5\` (range) - omit for all pitches
- **Time filter:** \`1|1-2|4\` (bar|beat range, **ends inclusive**, matches note start time); bounds use the same beat dialect as positions (decimal or \`±n\` offset, e.g. \`1|1+n/12-2|1\`)
  - **Whole bars:** \`3|*\` = all of bar 3, \`1|*-3|*\` = bars 1-3 — half-open, so exactly those bars with no spill onto the next downbeat. Prefer this for "measure N"; \`3|1-4|1\` would also match a note on 4|1
  - **Exclusive end:** append \`-<\` to make only the end bound exclusive — \`3|1-<4|1\` = up to but not including 4|1 (for sub-bar half-open spans)
- **MIDI parameters:** velocity (1-127; <=0 deletes note), pitch (0-127), timing (musical beats), duration (musical beats; <=0 deletes note), probability (0-1), deviation (-127 to 127)
- **Audio parameters:** gain (-70 to 24 dB), pitchShift (-48 to 48 semitones)
- **Operators:** \`+=\`, \`-=\` (add/subtract), \`*=\`, \`/=\` (scale current value), \`=\` (set)
- **Shorthand** (clears/simple sets): a single bar|beat-style token instead of \`param = value\` — \`v0\` delete · \`vN\`/\`v±N\`/\`vA-B\` velocity (range = humanized random, same as notes) · \`pN\`/\`p±N\` probability · \`n/4\`/\`Nbar\`/\`1bar+n/4\` duration · \`C4\` remap pitch (one per line; a selector still applies, e.g. \`C1: v0\`). Preferred for clearing/deleting; use the full \`param op expr\` form for computed changes (\`+=\`, \`*=\`, waveforms, ramps)
- **Expression:** arithmetic (+, -, *, /, %) with numbers, waveforms, math functions, current values, and durations: \`n<dur>\` note values (e.g. \`n/4\` = a quarter in any meter) and \`Nbar\` meter-aware bars (e.g. \`1bar\`, \`1bar+n/4\`) — same grammar as bar|beat and length fields. Both evaluate to musical beats and compose in any math expression
- **Math functions:** round(x), floor(x), ceil(x), abs(x), clamp(val,min,max), wrap(val,min,max) (wrap to inclusive range), reflect(val,min,max) (bounce within inclusive range), min(a,b,...), max(a,b,...), pow(base,exp), snap(pitch) (snap to Live Set scale; no-op if no scale), step(pitch, offset) (move by offset scale steps; even distribution for waveforms), legato([tolerance]) (set duration to reach next note's start time; optional tolerance in musical beats groups nearby starts as chords, e.g. legato(0.1) after humanizing)
- **Timing functions:** swing(amount [, grid] [, raw]) (auto-quantizes to grid then applies swing; amount=delay in musical beats — meter-relative, so these hints assume a quarter-note beat and scale up in x/8: 0.02=subtle, 0.05=medium, 0.1=heavy; grid: default = half the meter's beat (8th-note swing in x/4, 16th in x/8); override e.g. n/16; raw: skip auto-quantize), quant(grid) (snap to nearest grid point). Grid ref for both: n/4=quarter, n/8=8th, n/16=16th, n/12=triplet. swing()/quant() return an *absolute* position, so assign them with \`timing =\` (not \`+=\`). Relative nudges use \`+=\`/\`-=\` with a note value — \`timing += n/8\` shifts every note an eighth later

**Waveforms** (-1.0 to 1.0, per note position; once for audio):
- \`cos(period)\`, \`square(period)\` - start at peak (1.0); \`sin(period)\`, \`tri(period)\`, \`saw(period)\` - start at zero, rise to peak
  - All accept optional phase offset — a 0..1 cycle fraction, not a time value: \`cos(n/4, 0.25)\` (quarter-cycle shift). square adds pulse width (3rd arg, also a 0..1 fraction): \`square(n/4, 0, 0.75)\` (phase=0, 75% duty cycle)
- \`rand([min], [max])\` - random value (no args: -1 to 1, one arg: 0 to max, two: min to max)
- \`seq(a, b, ...)\` - cycle by \`note.index\` (per note within a clip; MIDI only — audio has no notes, use \`clipseq()\` there)
- \`clipseq(a, b, ...)\` - cycle by \`clip.index\` across the batch of clips (enumerated per-clip variation, e.g. \`pitch += clipseq(0, 5, 7)\`)
- \`choose(a, b, ...)\` - random selection from arguments
- \`ramp(start, end)\` - linear interpolation; reaches end value at time range end (or clip end)
- \`curve(start, end, exp)\` - exponential (exp>1: slow start, exp<1: fast start); reaches end value at time range end
- For ramp/curve, end the time filter on the last note's beat position so it reaches its end value. In 4/4: last 8th=N|4.5, last 16th=N|4.75
- Waveform period is a note value: \`n/4\` = quarter-note cycle, \`n/1\` = whole-note cycle, \`n/2\` = half-note cycle. For a meter-aware bar-length cycle use \`Nbar\` or \`clip.barDuration\` (e.g. \`cos(1bar)\`). Same \`n\` fraction grammar as everywhere; bare numbers are beats
- \`sync\` keyword (last arg on periodic waves) anchors phase to the arrangement timeline (continuous across clips) instead of clip start. Only meaningful on arrangement clips: a session clip has no arrangement position, so \`sync\` is ignored and the wave degrades to clip-relative (phase resets at clip start) with a warning — the modulation still applies. Without \`sync\`, phase is clip-relative everywhere (the default)

**Variables:** \`note.pitch\`, \`note.velocity\`, \`note.start\`, \`note.duration\`, \`note.probability\`, \`note.deviation\`, \`note.index\` (time-ordered), \`note.count\` (MIDI), \`next.pitch\`, \`next.velocity\`, \`next.start\`, \`next.duration\` (next distinct-start note; skips chords; warns on last note), \`audio.gain\`, \`audio.pitchShift\` (audio), \`clip.duration\`, \`clip.index\` (order of ids), \`clip.count\`, \`clip.position\` (arrangement only), \`clip.barDuration\` (all clips)

\`\`\`
timing = swing(0.05)             // swing (auto-quantizes). Use swing() alone unless asked for a specific grid
timing = quant(n/8)              // snap to 8th-note grid
timing = quant(n/16)             // snap to 16th-note grid
timing += 0.05 * rand()          // humanize timing
timing += n/8                    // nudge every note an eighth note later (relative)
velocity += 20 * cos(n/2)        // cycle every half note (2 beats in 4/4)
velocity += 20 * cos(clip.barDuration, sync) // bar-length cycle, continuous across clips
1|1-4|4.75: velocity = ramp(40, 127) // crescendo over 4 bars (16th grid)
C1-C2: velocity += 30            // accent bass notes
1|1-2|4: velocity = 100          // forte in bars 1-2
velocity = seq(100, 60, 80, 60)  // cycle accents per note (MIDI)
Gb1: pitch = seq(Gb1, Gb1, Gb1, Gb1, Ab1) // every 5th closed hat → open hat
pitch += clipseq(0, 5, 7)        // copy 0 unchanged, copy 1 +5, copy 2 +7 (per-clip)
gain = audio.gain - 6            // reduce audio clip by 6 dB
pitch = snap(note.pitch + 7) // transpose up fifth, snap to scale
pitch = step(note.pitch, sin(n/1) * 7) // oscillate ±7 scale steps smoothly
pitch = wrap(note.pitch + 5, C3, C5) // transpose up 5, wrap within C3-C5
velocity *= 0.5                  // halve all velocities
C1-C2: duration /= 2             // halve duration of bass notes
duration = n/8                   // every note → an eighth note (any meter)
duration += n/16                 // lengthen every note by a sixteenth
duration = legato()              // extend each note to reach the next
duration = legato(0.1)           // legato with tolerance (after humanizing timing)
\`\`\`

swing() auto-quantizes to the swing grid, so changing swing amount is always safe without a separate quant() step. Use \`raw\` to skip auto-quantize: \`swing(0.05, raw)\`

update-clip's \`quantizeGrid\` param uses Live's native grid enum (\`1/4\`,\`1/8\`,\`1/8T\`,\`1/16\`,\`1/16T\`,\`1/32\`) but also accepts the equivalent \`n/N\` note value (\`n/12\`=\`1/8T\`, \`n/24\`=\`1/16T\`, etc.); the mixed grids \`1/8+1/8T\`/\`1/16+1/16T\` are enum-only.

\`+=\` compounds on repeated calls; \`=\` is idempotent. \`*=\`/\`/=\` scale the current value (\`timing *=\` scales absolute note position). Use update-clip with only transforms to modify existing notes.
Transforms modify notes in place — previous transforms are already baked in. Don't re-apply earlier transforms.
MIDI params ignored for audio clips, vice versa.
Across a batch (update-clip \`ids\` / duplicate copies), \`clip.index\`/\`clip.count\` span the full batch — drive per-clip variation with \`clip.index\` arithmetic (\`pitch += clip.index * 12\`) or \`clipseq()\` (\`pitch += clipseq(0, 5, 7)\`); see Shape above.

**Editing existing notes (update-clip):** \`preTransforms\` is *the* way to delete or change notes already in the clip. Pipeline: \`preTransforms → notes (merge) → transforms\`. \`preTransforms\` runs on the existing notes BEFORE any new \`notes\` merge — clear a whole bar (\`3|*: v0\`), a region (\`1|1-2|1: v0\`), a lane (\`C1: v0\`), everything (\`v0\`), or remap (\`C1: C4\`) — the \`v0\` shorthand is preferred for clearing (\`velocity = 0\` is the longhand equivalent); works with or without \`notes\`; ignored on audio clips. Same syntax as transforms. \`transforms\` mutates the merged result — also the efficient way to *thin* density: generate with repeats/bar-copies in \`notes\`, then prune with a selector instead of scattering \`v0\`s. (A \`v0\` at an existing note's start also deletes it, but prefer \`preTransforms\`; reserve inline \`v0\` for notes built in the same \`notes\` string.)
${process.env.ENABLE_CODE_EXEC === "true" ? codeTransformsSkills : ""}
## Finding Library Content

Use \`ppal-library\` to search Live's browser library and the user's configured sample folder.

- Defaults to audio samples (the only kind loadable into clips/Simpler today). Other \`kind\` values are discovery-only.
- \`query\` is a name substring; use \`*\` as a multi-character wildcard (e.g., \`kick*acoustic\`).
- \`tags\` is comma-separated; results must match ALL listed tags. Use \`action: "listTags"\` to discover available tags, or \`action: "listCategories"\` to browse Live's category taxonomy (Sounds, Drums, Genres, …) and \`category: "Drums"\` to list a category's tags.
- \`type\` filters by playback type: \`loop\` (loops), \`oneshot\` (one-shots, e.g. a kick), \`impulse-response\` (convolution IRs). Each result also reports \`type\`, so you can tell a one-shot kick from a drum loop — prefer \`oneshot\` for hits and \`loop\` for grooves.
- \`kind: "midi"\` covers ALL MIDI content — both \`.mid\` files and MIDI Live clips (\`.alc\`) — so it's the right kind for melody/chord ideas. \`kind: "live-clip"\` returns every \`.alc\` (MIDI and audio); \`.alc\` results carry \`subtype\` (\`midi\`/\`audio\`) to disambiguate.
- \`source\`: filter where the file lives. \`sampleFolder\` is the user-configured sample folder on disk (bypasses Live's DB); \`user\`, \`pack\`, \`builtin\`, \`cloud\`, \`plugin\` query Live's DB.
- \`inFolder\` restricts a search to immediate children of one absolute folder path (composes with the other filters).
- \`verifyPaths: true\` stats each result and adds \`pathExists\` so you can skip files moved/deleted since Live last indexed (off by default; adds one filesystem check per result).
- \`action: "searchBatch"\` runs many filtered searches in one call. Pass \`queries\` as an array of objects each carrying the same filters as a single search plus an optional \`label\`; results come back grouped per query (capped at 20).
- \`action: "listPlugins"\` enumerates installed VST/AU/etc. from Live's plugin DB. Filter with \`query\` (name substring), \`vendor\`, \`format\` (VST/VST3/AU), \`deviceKind\` (\`instrument\` / \`audiofx\` — \`midifx\` has no plugin equivalent), or \`subcategory\`.
- Items from the user's sample folder appear before Live's library items in results.
- Each result includes \`folder\` (its immediate parent folder name). Use it to sanity-check tag hits: Live's tags are noisy, so a \`Kick\`-tagged file under an \`IR Library\` folder is probably a reverb impulse, not a drum.
- Pass an absolute \`path\` from a result to \`ppal-create-clip\` / \`ppal-update-clip\` (audio clips) or \`ppal-create-device\` / \`ppal-update-device\` (Simpler \`sample\`).

## Working with Ableton Live

**Views and Playback:**
- Session View: Jam, try ideas, build scenes
  - Use auto:"play-scene" when generating clips; warn user about clip restarts
- Arrangement View: Structure songs on a timeline
  - Session clips override Arrangement; use "play-arrangement" for arrangement playback

**Creating Music:**
- For drum tracks, read the track with \`drum-map\` include for correct pitches - don't assume General MIDI
- Drums: set \`n<dur>\` explicitly and re-set it per drum/pitch (duration is stateful — a hat's \`n/16\` leaks onto the next lane otherwise); space repeated hits with \`1|1xN\` repeats, not hand-listed beats
- Use velocity dynamics (pp=40, p=60, mf=80, f=100, ff=120) for expression
- Keep harmonic rhythm in sync across tracks

**Layering:** To layer tracks on one instrument, duplicate with routeToSource=true. New track controls the same instrument.

**Locators:** Use ppal-update-live-set to create/rename/delete locators at bar|beat positions. Use locator names with ppal-playback to start or loop from named positions.

### Device Paths

Slash-separated segments: \`t\`=track, \`rt\`=return, \`mt\`=master, \`d\`=device, \`c\`=chain, \`rc\`=return chain, \`p\`=drum pad

- \`t0/d0\` = first device on first track
- \`rt0/d0\` = first device on Return A
- \`mt/d0\` = first device on master track
- \`t0/d0/c0/d0\` = first device in rack's first chain
- \`t0/d0/rc0/d0\` = first device in rack's return chain
- \`t0/d0/pC1/d0\` = first device in Drum Rack's C1 pad

Chains are auto-created when referenced (e.g., \`c0\` on an empty rack creates a chain). Up to 16 chains.

**Simpler sample:** Load a sample with \`params: [{name: "sample", value: "<absolute file path>"}]\` on ppal-create-device or ppal-update-device; set its level with \`{name: "gainDb", value: <dB>}\` (0 = unity). \`sample\` is always a \`params\` entry — there is no top-level \`sample\` argument. Read-device: \`include: ["sample"]\` returns just the sample file path as a flat top-level \`sample\` field (ideal for scanning every pad's sample in a drum rack); \`include: ["params"]\` returns the full set including \`sample\`, \`gainDb\`, and \`multiSampleMode\`. Writes are skipped with a warning on non-Simpler devices and on Simpler in multi-sample mode.

**Build a Drum Rack:** Create the rack (\`deviceName="Drum Rack"\`), then one ppal-create-device call per pad: \`deviceName="Simpler" path="t0/d0/p<Note>/d0" name="<PadName>" params=[{name: "sample", value: "<abs path>"}]\`. The note name addresses the pad (\`pC1\`, \`pF#1\`); its chain auto-creates, and the \`sample\` param loads the sample into the Simpler in the same call — no separate sample step. One call per pad (each takes a different sample). Standard layout: 16 pads chromatically from C1 up to D#2/Eb2. Get paths from \`ppal-library\`; to match an existing kit's pad notes, read the track with \`drum-map\` first.

### Specialized Device Controls

Some native devices expose class-level controls beyond their DeviceParameters, through two surfaces: **pseudo-params** (set via \`params\` {name, value} entries, read back in \`parameters\`) and **\`actions\`** (function-call strings on update-device). Discover a device's surface at runtime rather than guessing values: read-device \`include: ["params"]\` lists its pseudo-params, \`include: ["actions"]\` lists action signatures, and \`include: ["options"]\` returns the valid values for each pseudo-param (\`paramOptions\`) plus dynamic catalogs (wavetables, IR files, sidechain sources) and Wavetable mod routes/sources. Invalid enum values warn-and-skip and list the valid options. The bullets below give each device's pseudo-params and non-obvious behavior — read options for accepted values.

Instruments:

- **Drift** mod matrix. Fixed-target source slots \`filterMod1Source\` \`filterMod2Source\` \`lfoSource\` \`pitchMod1Source\` \`pitchMod2Source\` \`shapeSource\`; three free slots pair \`mod1Source\`/\`mod2Source\`/\`mod3Source\` with \`mod1Target\`/\`mod2Target\`/\`mod3Target\` (target None disables the slot). For each active free slot also set its matching amount DeviceParameter (e.g. \`Mod Matrix Amt 1\`). Plus \`voiceMode\` (Poly/Mono/Stereo/Unison), \`voiceCount\`, \`pitchBendRange\`.
- **Wavetable** \`filterRouting\`, \`monoPoly\`, \`polyVoices\`, \`unisonMode\`, \`unisonVoiceCount\`, \`osc1Engine\`/\`osc2Engine\`. For \`osc1Category\`/\`osc2Category\` + \`osc1Wavetable\`/\`osc2Wavetable\`, set category first (options \`oscWavetableCategories\`, then \`osc1Wavetables\`/\`osc2Wavetables\` list the selected category's tables). Mod matrix via actions; options returns current routes (\`modulations\`), \`modulatableParameters\`, and \`modulationSources\`.
- **Meld** \`monoPoly\`, \`polyVoices\`, \`unisonVoices\`.
- **Simpler** \`sample\` (file path), \`gainDb\` (sample level, 0 = unity), \`playbackMode\` (classic/one-shot/slicing), \`slicingPlaybackMode\`, \`retrigger\`, \`voices\`; read-only \`multiSampleMode\`, \`estimatedPlaybackLength\`. Sample-editing actions operate on the active region — set the \`S Start\`/\`S Length\` DeviceParameters first to target a sub-range.

Audio effects:

- **Compressor** sidechain: \`sidechainSourceTrackId\` (a trackId, or null for No Input), then \`sidechainChannel\` — set the source first, as the valid channels vary by source. options lists \`sidechainSourceTrackIds\` and the current source's \`sidechainChannels\`.
- **EQ Eight** \`globalMode\` (stereo / L/R / M/S), \`oversample\`. In L/R the A bands process Left and B bands Right; in M/S, A = Mid and B = Side. Set \`globalMode\`, then write the A-/B-suffix band DeviceParameters (e.g. \`5 Frequency B\`).
- **Hybrid Reverb** \`irCategory\`, \`irFile\` (set category first; options \`irCategoryList\`, then \`irFileList\` lists the selected category's files), \`irAttackTime\`, \`irDecayTime\`, \`irSizeFactor\`, \`irTimeShapingOn\`.
- **Roar** \`routingMode\`, \`envListen\`.
- **Spectral Resonator** \`midiGate\`, \`monoPoly\`, \`pitchBendRange\`, \`modMode\`, \`pitchMode\`, \`polyphony\`.

### Moving Clips

\`arrangementStart\` moves arrangement clips; \`toSlot\` (trackIndex/sceneIndex, both 0-based — scene 1 = index 0) moves session clips. Moving clips changes their IDs - re-read to get new IDs.
\`arrangementLength\` sets arrangement playback region. \`split\` divides arrangement clips at bar|beat positions.

### Take Lanes (Arrangement Variations)

Stack alternate takes of an arrangement clip at the same position; only the active take plays (the user auditions/comps in Live's UI).

- \`takeLane\` on create-clip + duplicate (arrangement only; duplicate is MIDI-only): omit/\`0\` = main lane; \`1+\` = that lane (auto-created up to it); \`"new"\` = append a fresh lane. \`takeLaneName\` names a lane this call creates.
- Variation workflow: a few duplicate calls with \`takeLane: "new"\` + \`transforms\` to vary each copy. read-track \`arrangement-clips\` include lists \`takeLanes\` — each entry carries \`takeLane\` (1-based, matching the write param) and its \`name\`, so you can round-trip a read back to a write directly.
- 8 lanes/track max; creating over an existing clip replaces it (like the main lane). One-way: Producer Pal can't delete or comp take lanes — that's done in Live (expand the track's take-lane arrow to see them).
- Take-lane clips are append-only: \`update-clip\` (\`split\`, \`arrangementStart\`, \`arrangementLength\`) and \`ppal-delete\` warn+skip on them. Main→take duplicate recreates the clip from notes and drops envelope automation; take→main promote isn't supported. For any of these, ask the user to do it in Live's UI.
`;
