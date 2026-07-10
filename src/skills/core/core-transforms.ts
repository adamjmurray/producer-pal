// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A section of the standard skills body, pulled into the standard driver via
// `@include` (see core-standard.ts, which lists the manifest). Each section is
// its own override slot (skill-slots.ts) so users can edit it in isolation —
// or suppress it by deleting its include line in a `standard` driver override.
// The Transforms + preTransforms section of the standard core: the note/audio
// transform DSL. Carries the optional code-transforms include inside it (the
// fragment only exists when ENABLE_CODE_EXEC is set; a missing fragment
// resolves to ""). The include is glued to the end of the preTransforms
// paragraph (no preceding newline) on purpose: when the fragment is absent it
// then leaves no dangling trailing newline, so core-transforms follows the
// "no trailing blank line" fragment convention like the other core sections —
// the manifest's own blank line spaces it from the next section. code-transforms
// supplies its own leading blank line, so it's still separated when present.
export const coreTransforms = `## Transforms

Add \`transforms\` parameter to create-clip, update-clip, or duplicate.

**Shape:** a single string, broadcast across every clip/copy. Multiple expressions: newline-separated. Per-clip variation: \`clip.index\` arithmetic or \`clipseq()\` inside the string (below). Structurally-distinct edits per clip → separate tool calls.

**Syntax:** \`[selector:] parameter operator expression\` (one per line)
- **Selector:** pitch and/or time filter, optionally a \`where(...)\` value test, followed by \`:\` - e.g., \`C3:\`, \`1|1-2|4:\`, \`C3 1|1-2|4:\`, \`1|1-2|4 C3:\`, \`where(note.velocity < 40):\`. **Per-line:** every selector (pitch, time, where) applies only to its own line — never carried to or inherited from neighbors; a line with no selector hits all notes. Repeat the selector to scope several lines
- **Pitch filter:** \`C3\` (single) or \`C3-C5\` (range) - omit for all pitches
- **Time filter:** \`1|1-2|4\` (bar|beat range, **ends inclusive**, matches note start time); bounds use the same bar|beat dialect as Time & Note Values positions (decimal or \`±n\` offset, e.g. \`1|1+n/12-2|1\`)
  - **Single point:** a bare bar|beat with no \`-\` (\`4|3.5:\`) targets only the note starting exactly there — e.g. \`Gb1 4|3.5: ratchet(4)\` rolls just that note
  - **Whole bars:** \`3|*\` = all of bar 3, \`1|*-3|*\` = bars 1-3 — half-open, so exactly those bars with no spill onto the next downbeat. Prefer this for "measure N"; \`3|1-4|1\` would also match a note on 4|1
  - **Exclusive end:** append \`-<\` to make only the end bound exclusive — \`3|1-<4|1\` = up to but not including 4|1 (for sub-bar half-open spans)
- **Value filter** \`where(...)\`: keep only notes whose properties satisfy a boolean test — \`where(note.velocity < 40): delete\` deletes quiet notes, \`where(note.velocity > 100): velocity += 20\` accents loud ones, \`where(note.probability < .5): delete\` thins. Build it from comparisons (\`> >= < <= == !=\`), booleans (\`&& || !\`), parens, arithmetic, and functions over note.velocity/deviation/duration/probability/pitch/start (\`note.duration\`/\`note.start\` in musical beats; RHS may be a number, note name, or \`n/8\`). Functions work too — \`where(abs(note.start - 4) < 1): velocity += 20\` (near beat 4, either side), \`where(min(note.velocity, note.deviation) > 80): ...\`. AND-combines with a pitch/time selector: \`C3-C5 where(note.velocity > 80): velocity += 20\`. Comparisons tolerate sub-beat float drift, so \`==\`/\`!=\` are safe even on float props (\`note.start == n/8\` matches a note that names that beat); still prefer \`<\`/\`>\` for ranges. Note properties only (no note.index/count/next); all functions except legato/seq (they need the selection); not on note-count ops
- **MIDI parameters:** velocity (<=0 deletes note, else capped at 127), pitch (0-127), timing (musical beats), duration (musical beats; <=0 deletes note), probability (0-1), deviation (-127 to 127)
- **Audio parameters:** gain (-70 to 24 dB), pitchShift (-48 to 48 semitones)
- **Operators:** \`+=\`, \`-=\` (add/subtract), \`*=\`, \`/=\` (scale current value), \`=\` (set)
- **Shorthand** (clears/simple sets): a single bar|beat-style token instead of \`param = value\` — \`delete\` (or \`v0\`) delete a note · \`vN\`/\`v±N\`/\`vA-B\` velocity (range = humanized random, same as notes) · \`pN\`/\`p±N\` probability · \`n/4\`/\`Nbar\`/\`1bar+n/4\` duration · \`C4\` remap pitch (one per line; a selector still applies, e.g. \`C1: delete\`). \`delete\` is a transforms/preTransforms alias only — bar|beat \`notes\` strings still use \`v0\`. Preferred for clearing/deleting; use the full \`param op expr\` form for computed changes (\`+=\`, \`*=\`, waveforms, ramps). Note \`vA-B\` is the one shorthand with no \`param = ...\` longhand — it sets velocity AND velocity_deviation together, so write it as the shorthand (\`velocity = vA-B\` errors)
- **Expression:** arithmetic (+, -, *, /, %) with numbers, waveforms, math functions, current values, and durations: \`n<dur>\` note values (e.g. \`n/4\` = a quarter in any meter) and \`Nbar\` meter-aware bars (e.g. \`1bar\`, \`1bar+n/4\`) — same grammar as bar|beat and length fields. Both evaluate to musical beats and compose in any math expression (so in a non-time param like \`velocity\` a bare \`1bar\` resolves to its beat count — e.g. 4 in 4/4 — rarely what you want there)
- **Math functions:** round(x), floor(x), ceil(x), abs(x), clamp(val,min,max), wrap(val,min,max) (wrap to inclusive range), reflect(val,min,max) (bounce within inclusive range), min(a,b,...), max(a,b,...), pow(base,exp), snap(pitch) (snap to Live Set scale; no-op if no scale), step(pitch, offset) (move by offset scale steps; even distribution for waveforms), legato([tolerance]) (set duration to reach next note's start time; optional tolerance in musical beats groups nearby starts as chords, e.g. legato(0.1) after humanizing)
- **Timing functions:** swing(amount [, grid] [, raw]) (auto-quantizes to grid then applies swing; amount=delay in musical beats — meter-relative, so these hints assume a quarter-note beat and scale up in x/8: 0.02=subtle, 0.05=medium, 0.1=heavy; grid: default = half the meter's beat (8th-note swing in x/4, 16th in x/8); override e.g. n/16; raw: skip auto-quantize), quant(grid) (snap to nearest grid point). Grid ref for both: n/4=quarter, n/8=8th, n/16=16th, n/12=triplet. swing()/quant() return an *absolute* position, so assign them with \`timing =\` (not \`+=\`). Relative nudges use \`+=\`/\`-=\` with a note value — \`timing += n/8\` shifts every note an eighth later
- **Note-count operations** (change how many notes exist — write on their own line, NOT as a value: \`velocity = ratchet(2)\` errors): \`ratchet(N)\` divides each matched note into N equal pieces (a roll); \`ratchet(n/16)\` instead cuts on the absolute 16th-note grid (pieces align to bar positions, partial slivers at the ends); \`repeat(offset, copies)\` echoes each matched note forward by \`offset\` (a note value like \`n/8\` or \`Nbar\`); \`copies\` defaults to 1, so \`repeat(n/8)\` adds one echo an 8th later and \`repeat(n/8, 3)\` adds three (it does NOT resize the clip — copies past the end stay hidden until you grow \`length\`; to double a loop AND lengthen the clip, use update-clip's \`duplicateLoop\` instead); \`split(2|1, 2|3)\` cuts at explicit, possibly unequal clip bar|beat positions (each position cuts whichever matched note spans it; add a trailing \`sync\` — \`split(6|1, sync)\` — to read positions on the arrangement timeline instead, ignored with a warning on session clips); \`merge()\` spans all same-pitch matched notes into one sustained note (optional gap tolerance: \`merge(0)\` glues only touching/overlapping notes, \`merge(n/8)\` glues notes within an 8th-note gap). A selector scopes them (\`C1: ratchet(4)\`, \`2|*: merge()\`); a transform after a note op sees the rebuilt notes (so \`note.index\` re-derives). MIDI only

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

**Variables:** \`note.pitch\`, \`note.velocity\`, \`note.start\`, \`note.duration\`, \`note.probability\`, \`note.deviation\`, \`note.index\` (time-ordered), \`note.count\` (MIDI), \`next.pitch\`, \`next.velocity\`, \`next.start\`, \`next.duration\` (next distinct-start note; skips chords; warns on last note), \`audio.gain\`, \`audio.pitchShift\` (audio), \`clip.duration\`, \`clip.index\` (order of ids), \`clip.count\`, \`clip.position\` (arrangement only)

\`\`\`
timing = swing(0.05)             // swing (auto-quantizes). Use swing() alone unless asked for a specific grid
timing = quant(n/8)              // snap to 8th-note grid
timing = quant(n/16)             // snap to 16th-note grid
timing += 0.05 * rand()          // humanize timing
timing += n/8                    // nudge every note an eighth note later (relative)
velocity += 20 * cos(n/2)        // cycle every half note (2 beats in 4/4)
velocity += 20 * cos(1bar, sync)  // bar-length cycle, continuous across clips
1|1-4|4.75: velocity = ramp(40, 127) // crescendo over 4 bars (16th grid)
C1-C2: velocity += 30            // accent bass notes
where(note.velocity < 40): delete // delete the quiet notes
where(note.velocity > 100): velocity += 20 // accent the loud ones (clamps at 127)
C3-C5 where(note.probability < .5): delete // thin low-probability notes in a pitch band
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
ratchet(2)                       // split each note into two equal pieces (a roll)
ratchet(n/16)                    // cut each note on the 16th-note grid instead
C1: ratchet(4)                   // 4-stroke roll on the kick only
repeat(1bar)                     // echo every note one bar later (does not resize the clip)
repeat(n/8, 3)                   // three 8th-note echoes (original + 3 copies)
split(2|1, 2|3)                  // cut notes at explicit (unequal) clip positions
split(6|1, sync)                 // cut at an arrangement-timeline position
merge()                          // span same-pitch notes into sustained notes
merge(0)                         // ...but only where they touch or overlap
\`\`\`

swing() auto-quantizes, so changing the amount is always safe without a separate quant(). Skip it with \`raw\`: \`swing(0.05, raw)\`

update-clip's \`quantizeGrid\` param uses Live's native grid enum (\`1/4\`,\`1/8\`,\`1/8T\`,\`1/16\`,\`1/16T\`,\`1/32\`) but also accepts the equivalent \`n/N\` note value (\`n/12\`=\`1/8T\`, \`n/24\`=\`1/16T\`, etc.); the mixed grids \`1/8+1/8T\`/\`1/16+1/16T\` are enum-only.

\`+=\` compounds on repeated calls; \`=\` is idempotent. \`*=\`/\`/=\` scale the current value (\`timing *=\` scales absolute note position). Use update-clip with only transforms to modify existing notes.
Transforms modify notes in place — previous transforms are already baked in, so don't re-apply earlier ones.
MIDI params ignored for audio clips, vice versa.
Across a batch (update-clip \`ids\` / duplicate copies / create-clip multiple slots or arrangement positions), \`clip.index\`/\`clip.count\` span the full batch — drive per-clip variation with \`clip.index\` arithmetic (\`pitch += clip.index * 12\`) or \`clipseq()\`; see Shape above.

### preTransforms (editing notes already in the clip)

\`preTransforms\` is *the* way to delete or change notes already in the clip. Pipeline: \`preTransforms → notes (merge) → transforms\`. It runs on the existing notes BEFORE any new \`notes\` merge — clear a whole bar (\`3|*: delete\`), a region (\`1|1-2|1: delete\`), a lane (\`C1: delete\`), everything (\`delete\`), or remap (\`C1: C4\`); the \`delete\` shorthand (alias \`v0\`) is preferred for clearing (\`velocity = 0\` is the longhand equivalent). Works with or without \`notes\`; ignored on audio clips. Same syntax as transforms. \`transforms\` then mutates the merged result — also the efficient way to *thin* density: generate with repeats/bar-copies in \`notes\`, then prune with a selector instead of scattering \`delete\`s. (A \`v0\` at an existing note's start also deletes it, but prefer \`preTransforms\`; reserve inline \`v0\` for notes built in the same \`notes\` string.)@include "./code-transforms.md"`;
