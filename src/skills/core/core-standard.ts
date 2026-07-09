// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The standard skills body, inlined into the `standard` full-skills driver (see
// builtin-fragments.ts) rather than pulled in via @include — so the notation
// guide's `@include` lives INSIDE this text and can be moved wherever the
// notation section should appear. It sits at the top here (matching the original
// header → notation → core order); move the directive to reposition the guide.
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

## Transforms

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

\`preTransforms\` is *the* way to delete or change notes already in the clip. Pipeline: \`preTransforms → notes (merge) → transforms\`. It runs on the existing notes BEFORE any new \`notes\` merge — clear a whole bar (\`3|*: delete\`), a region (\`1|1-2|1: delete\`), a lane (\`C1: delete\`), everything (\`delete\`), or remap (\`C1: C4\`); the \`delete\` shorthand (alias \`v0\`) is preferred for clearing (\`velocity = 0\` is the longhand equivalent). Works with or without \`notes\`; ignored on audio clips. Same syntax as transforms. \`transforms\` then mutates the merged result — also the efficient way to *thin* density: generate with repeats/bar-copies in \`notes\`, then prune with a selector instead of scattering \`delete\`s. (A \`v0\` at an existing note's start also deletes it, but prefer \`preTransforms\`; reserve inline \`v0\` for notes built in the same \`notes\` string.)
@include "./code-transforms.md"
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
- \`action: "findSimilar"\` ranks samples by audio similarity to a seed sample (\`similarTo\`: an absolute path, e.g. from a prior result); each result carries a \`similarity\` score (-1 to 1, ~1 = very similar). Combine with the search filters to constrain candidates (e.g. \`similarTo\` a kick + \`tags: "Kick"\` for "more kicks like this"). \`action: "findDuplicates"\` groups library samples with identical audio (re-shipped duplicates), scoped by the same filters.
- Items from the user's sample folder appear before Live's library items in results.
- Each result includes \`folder\` (its immediate parent folder name). Use it to sanity-check tag hits: Live's tags are noisy, so a \`Kick\`-tagged file under an \`IR Library\` folder is probably a reverb impulse, not a drum.
- Pass an absolute \`path\` from a result to \`ppal-create-clip\` / \`ppal-update-clip\` (audio clips) or \`ppal-create-device\` / \`ppal-update-device\` (Simpler \`sample\`).

## Devices & Instruments

### Device Paths

Slash-separated segments: \`t\`=track, \`rt\`=return, \`mt\`=master, \`d\`=device, \`c\`=chain, \`rc\`=return chain, \`p\`=drum pad

- \`t0/d0\` = first device on first track
- \`rt0/d0\` = first device on Return A
- \`mt/d0\` = first device on master track
- \`t0/d0/c0/d0\` = first device in rack's first chain
- \`t0/d0/rc0/d0\` = first device in rack's return chain
- \`t0/d0/pC1/d0\` = first device in Drum Rack's C1 pad

Chains are auto-created when referenced (e.g., \`c0\` on an empty rack creates a chain). Up to 16 chains.

### Simpler & Drum Racks

**Simpler sample:** Load a sample with \`params: [{name: "sample", value: "<absolute file path>"}]\` on ppal-create-device or ppal-update-device; set its level with \`{name: "gainDb", value: <dB>}\` (0 = unity). \`sample\` is always a \`params\` entry — there is no top-level \`sample\` argument. Read-device: \`include: ["sample"]\` returns just the sample file path as a flat top-level \`sample\` field (ideal for scanning every pad's sample in a drum rack); \`include: ["params"]\` returns the full set including \`sample\`, \`gainDb\`, and \`multiSampleMode\`. Writes are skipped with a warning on non-Simpler devices and on Simpler in multi-sample mode.

**Build a Drum Rack (one call):** Create the rack and load every pad's sample in a single ppal-create-device: \`deviceName="Drum Rack" path="t0" params=[{name:"pC1/d0/sample", value:"<abs path>"}, {name:"pC#1/d0/sample", value:"<abs path>"}, ...]\`. A param \`name\` containing \`/\` is a path relative to the rack: the pad-note segment addresses the pad (\`pC1\`, \`pF#1\`), \`d0\` its first device, and the last segment is the param. Setting a pad's \`sample\` is a pad property — the pad's chain and a Simpler to hold the sample auto-create as needed. Add \`{name:"pC1/d0/gainDb", value:<dB>}\` (listed after the sample) to set a pad's level. Standard layout: 16 pads chromatically from C1 up to D#2/Eb2. Get sample paths from \`ppal-library\`; to match an existing kit's pad notes, read the track with \`drum-map\` first. The same path-prefixed params work on ppal-update-device to set/replace samples on an existing rack.

**Pad sample-write policy** (applied per pad; a skip-and-warn never tears down the rack): empty pad → create Simpler + load; pad with a Simpler → replace its sample; Simpler in multi-sample mode → skip+warn; pad with a **DrumSampler** → replaced with a Simpler + a notice (DrumSampler's sample is not controllable via the Live API); any other device → skip+warn. To swap a pad that skip-warned, delete its device first then set the sample: \`ppal-delete type="device" path="t0/d0/pC1/d0"\` clears the device inside the pad (chain stays); to remove the whole pad instead use \`ppal-delete type="drum-pad" path="t0/d0/pC1"\`. \`ppal-delete\` accepts comma-separated paths to clear several pads at once.

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

### VST/AU Plugins

Producer Pal can open or close a plug-in's editor window (\`openPluginWindow\` on ppal-select) but **cannot control anything inside a VST/AU plug-in directly** — its internal parameters aren't exposed to the Live API. To make a plug-in's parameters controllable, the user maps them onto the Live plug-in device in Live's Configure mode (expand the device, click "Configure", then click the controls in the plug-in to expose); Producer Pal can then read and set those mapped parameters like any other device parameter. You cannot do the mapping for the user — explain the steps and point them to the [Configure mode manual](https://www.ableton.com/live-manual/12/working-with-instruments-and-effects/#plug-in-configure-mode). Limits: up to 128 parameters can be mapped (so pick the most important ones), and not every plug-in parameter is mappable.

## Arrangement

### Moving Clips

\`arrangementStart\` moves arrangement clips; \`toSlot\` (trackIndex/sceneIndex, both 0-based — scene 1 = index 0) moves session clips. Moving clips changes their IDs - re-read to get new IDs.
\`arrangementLength\` sets arrangement playback region. \`split\` divides arrangement clips at bar|beat positions measured from the clip's own start (1|1 = clip start, NOT song position).

### Take Lanes (Arrangement Variations)

Stack alternate takes of an arrangement clip at the same position; only the active take plays (the user auditions/comps in Live's UI).

- \`takeLane\` on create-clip + duplicate (arrangement only; duplicate is MIDI-only): omit/\`0\` = main lane; \`1+\` = that lane (auto-created up to it); \`"new"\` = append a fresh lane. \`takeLaneName\` names a lane this call creates.
- Variation workflow: a few duplicate calls with \`takeLane: "new"\` + \`transforms\` to vary each copy. read-track \`arrangement-clips\` include lists \`takeLanes\` — each entry carries \`takeLane\` (1-based, matching the write param) and its \`name\`, so you can round-trip a read back to a write directly.
- 8 lanes/track max; creating over an existing clip replaces it (like the main lane). One-way: Producer Pal can't delete or comp take lanes — that's done in Live (expand the track's take-lane arrow to see them).
- Take-lane clips are append-only: \`update-clip\` (\`split\`, \`arrangementStart\`, \`arrangementLength\`) and \`ppal-delete\` warn+skip on them. Main→take duplicate recreates the clip from notes and drops envelope automation; take→main promote isn't supported. For any of these, ask the user to do it in Live's UI.

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

- **remember** (scope:memory) lasting facts about the user (\`user\`: default key/genre/gear) or how they want you to work (\`feedback\`: e.g. "always propose 2 variations before writing"), plus cross-project goals (\`goal\`) and external pointers like a sample folder (\`reference\`). NOT this-Live-Set details (use scope:project) or one-off task facts.
- The description is all you see until you read a memory — make it a precise recall hook (what's inside, when it's relevant), not a vague label.
- Before remembering, check the index for an entry that already covers it and reuse its name to UPDATE, not duplicate. One fact per memory; pick the narrowest type.
- Default to a memory. Only when a fact is clearly a long-lived preference or core project goal that belongs always-in-context, ask before pinning it to context (an action:write to scope:global or scope:project) — you may do it on their behalf.
- **forget** anything wrong or outdated — don't leave stale entries. Convert relative dates ("next week") to absolute before storing.
- Remember quietly as facts emerge; don't announce each save.

## Getting Help

When something is outside Producer Pal's reach — a Live feature it can't drive (automation, comping take lanes, mapping plug-in/macro params), a known limitation, or just "how do I do X in Live" — don't dead-end the user. Explain the manual step and link the right resource.

- **Live itself** (Configure mode, comping, racks, MIDI, anything in Ableton): the [Ableton Live manual](https://www.ableton.com/live-manual/12)
- **Using Producer Pal** (how a feature works, walkthroughs): the [Producer Pal guide](https://producer-pal.org/guide) and [feature list](https://producer-pal.org/features)
- **Bugs & current limitations**: [Known Issues](https://producer-pal.org/support/known-issues)
`;
