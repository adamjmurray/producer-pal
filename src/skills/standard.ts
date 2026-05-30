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

**Note properties (required: pitch, start):**
- \`pitch\`: 0-127 (60 = C3)
- \`start\`: beats from clip start
- \`duration\`: beats (default: 1)
- \`velocity\`: 1-127 (default: 100)
- \`velocityDeviation\`: 0-127 (default: 0)
- \`probability\`: 0-1 (default: 1)

**Context properties:**
- \`track\`: { index, name, type, color }
- \`clip\`: { id, name, length, timeSignature, looping, index, count }
- \`location\`: { view, slot?, arrangementStart? }
- \`liveSet\`: { tempo, scale?, timeSignature }
- \`beatsPerBar\`: number

**Processing order:** notes → transforms → code. When \`notes\` and \`code\` are both provided, notes are parsed and transforms applied first. Code then receives those notes and can further transform them.
`;

export const skills = `# Producer Pal Skills

## Time in Ableton Live

- Positions: bar|beat (1-indexed, meter-relative). Sub-beat: a decimal (2|3.5) or a ±n note-value offset off the grid beat — \`1|1+n/12\` = beat 1 + an eighth triplet, \`1|2-n/24\` nudges just behind beat 2. Same \`n\` grammar as durations; no bare fractions
- Durations and \`@step\` intervals: absolute note values (denominator mandatory). \`n/4\` = quarter, \`n/8\` = eighth, \`n/16\` = sixteenth, \`n/12\` = eighth triplet (3 in a quarter), \`n3/8\` = dotted quarter (3 eighths). A quarter is a quarter in any meter
- Clip \`length\` and arrangement durations: \`Nbar\` (meter-aware, e.g. \`4bar\`), \`n<fraction>\` note value (e.g. \`n/4\` = quarter, \`n/8\` = eighth), or \`Nbar+n<fraction>\` mixed (e.g. \`1bar+n/4\`). Same \`n\` fraction grammar everywhere. No bare fractions/integers/decimals

## MIDI Syntax

Create MIDI clips using the bar|beat notation syntax:

\`[v0-127] [n<duration>] [p0-1] note(s) bar|beat\`

- Parameters (v/n/p), pitches, and positions can appear in any order and be interspersed
- Notes emit at time positions (bar|beat)
  - time positions are relative to clip start
  - the beat in bar|beat can be a comma-separated (no whitespace) list or repeat pattern
  - **Repeat patterns**: \`{bar|beat}x{count}[@{step}]\` generates sequences. count = how many notes
    - \`@step\` uses the same note-value form as \`n\` — \`@n/4\`, \`@1bar\` (bare \`@/4\` or \`@1\` is invalid). Defaults to the current duration (legato)
    - \`1|1x4@n/4\` → 4 notes a quarter apart; \`n/8 1|1x4\` → 4 eighths (step defaults to n value)
    - \`1|1x3@n/12\` → eighth-note triplets (3 in a quarter); \`n/16 1|1x16\` → 16 sixteenths spanning 4 quarters (a full bar in 4/4)
- v<velocity>: 0-127 (default: v100). Range v80-120 randomizes per note for humanization
  - \`v0\` deletes earlier notes at same pitch/time (**deletes until disabled** with non-zero v)
- n<duration>: Note length as an absolute note value. Default: \`n/4\` (quarter). REQUIRES denominator — \`n1\`, \`n2.5\`, \`n0.5\` are invalid; write \`n/4\`, \`n5/8\`, \`n/8\` instead. \`n/12\` = eighth triplet (3 in a quarter), \`n/6\` = quarter triplet (3 in a half)
- p<chance>: Probability from 0.0 to 1.0 (default: 1.0 = always)
- Notes: C0-G8 with # or b for sharps/flats (C#3, Bb2). C3 = middle C
- **Stateful**: v/n/p and pitch persist until changed — set once, applies to all following notes
- copying bars (**MERGES** - use v0 to clear unwanted notes):
  - @N= copies previous bar; @N=M copies bar M to N; @N-M=P copies bar P to range
  - @N-M=P-Q tiles bars P-Q across range; @clear clears copy buffer
  - Copies capture each note's v/n/p at the time it was written, not the current state
- **Editing existing clip notes** (update-clip): **prefer \`preTransforms\`** to delete or change notes already in the clip — clear a region (\`1|1-2|1: v0\`), a lane (\`C1: v0\`), everything (\`v0\`), or remap a drum lane (\`C1: C4\`); see Transforms. \`notes\` still overlays existing notes (v0-in-notes deletes at matching pitch/time), but reserve v0-in-notes for sculpting notes built **within the same \`notes\` string** — e.g. trimming after a bar copy, or in create-clip where nothing pre-exists

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
C3 D3 1|1 v0 C3 1|1 // delete earlier C3 (D3 remains)
C3 D3 1|1 @2=1 v0 D3 2|1 // bar copy then delete D3 from bar 2
v90-110 C1 1|1,3 D1 1|2,4 // humanized drum pattern
p0.5 C1 1|1,2,3,4 // 50% chance each kick plays
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
- **Time filter:** \`1|1-2|4\` (bar|beat range, inclusive, matches note start time); bounds use the same beat dialect as positions (decimal or \`±n\` offset, e.g. \`1|1+n/12-2|1\`)
- **MIDI parameters:** velocity (1-127; <=0 deletes note), pitch (0-127), timing (beats), duration (beats; <=0 deletes note), probability (0-1), deviation (-127 to 127)
- **Audio parameters:** gain (-70 to 24 dB), pitchShift (-48 to 48 semitones)
- **Operators:** \`+=\`, \`-=\` (add/subtract), \`*=\`, \`/=\` (scale current value), \`=\` (set)
- **Expression:** arithmetic (+, -, *, /, %) with numbers, waveforms, math functions, current values, and \`n<dur>\` absolute durations (e.g. \`n/4\` = a quarter note in any meter; same fraction grammar as bar|beat \`n\`). \`n<dur>\` evaluates to a number of musical beats and composes in any math expression
- **Math functions:** round(x), floor(x), ceil(x), abs(x), clamp(val,min,max), wrap(val,min,max) (wrap to inclusive range), reflect(val,min,max) (bounce within inclusive range), min(a,b,...), max(a,b,...), pow(base,exp), snap(pitch) (snap to Live Set scale; no-op if no scale), step(pitch, offset) (move by offset scale steps; even distribution for waveforms), legato([tolerance]) (set duration to reach next note's start time; optional tolerance in beats groups nearby starts as chords, e.g. legato(0.1) after humanizing)
- **Timing functions:** swing(amount [, grid] [, raw]) (auto-quantizes to grid then applies swing; amount=delay in beats: 0.02=subtle, 0.05=medium, 0.1=heavy; grid: default n/8=8th-note swing, n/16=16th-note swing; raw: skip auto-quantize), quant(grid) (snap to nearest grid point). Grid ref for both: n/4=quarter, n/8=8th, n/16=16th, n/12=triplet. Both return absolute positions — use \`timing =\`, not \`timing +=\`

**Waveforms** (-1.0 to 1.0, per note position; once for audio):
- \`cos(period)\`, \`square(period)\` - start at peak (1.0); \`sin(period)\`, \`tri(period)\`, \`saw(period)\` - start at zero, rise to peak
  - All accept optional phase offset: \`cos(n/4, 0.25)\`. square adds pulse width (3rd arg): \`square(n/4, 0, 0.75)\` (phase=0, 75% duty cycle)
- \`rand([min], [max])\` - random value (no args: -1 to 1, one arg: 0 to max, two: min to max)
- \`seq(a, b, ...)\` - cycle by \`note.index\` (per note within a clip; MIDI only — audio has no notes, use \`clipseq()\` there)
- \`clipseq(a, b, ...)\` - cycle by \`clip.index\` across the batch of clips (enumerated per-clip variation, e.g. \`pitch += clipseq(0, 5, 7)\`)
- \`choose(a, b, ...)\` - random selection from arguments
- \`ramp(start, end)\` - linear interpolation; reaches end value at time range end (or clip end)
- \`curve(start, end, exp)\` - exponential (exp>1: slow start, exp<1: fast start); reaches end value at time range end
- For ramp/curve, end the time filter on the last note's beat position so it reaches its end value. In 4/4: last 8th=N|4.5, last 16th=N|4.75
- Waveform period is a note value: \`n/4\` = quarter-note cycle, \`n/1\` = whole-note cycle, \`n/2\` = half-note cycle. For a meter-aware bar-length cycle use \`clip.barDuration\` (e.g. \`cos(clip.barDuration)\`). Same \`n\` fraction grammar as everywhere; bare numbers are beats
- \`sync\` keyword (last arg on periodic waves) syncs phase to arrangement timeline instead of clip start

**Variables:** \`note.pitch\`, \`note.velocity\`, \`note.start\`, \`note.duration\`, \`note.probability\`, \`note.deviation\`, \`note.index\` (time-ordered), \`note.count\` (MIDI), \`next.pitch\`, \`next.velocity\`, \`next.start\`, \`next.duration\` (next distinct-start note; skips chords; warns on last note), \`audio.gain\`, \`audio.pitchShift\` (audio), \`clip.duration\`, \`clip.index\` (order of ids), \`clip.count\`, \`clip.position\` (arrangement only), \`clip.barDuration\` (all clips)

\`\`\`
timing = swing(0.05)             // swing (auto-quantizes). Use swing() alone unless asked for a specific grid
timing = quant(n/8)              // snap to 8th-note grid
timing = quant(n/16)             // snap to 16th-note grid
timing += 0.05 * rand()          // humanize timing
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

\`+=\` compounds on repeated calls; \`=\` is idempotent. \`*=\`/\`/=\` scale the current value (\`timing *=\` scales absolute note position). Use update-clip with only transforms to modify existing notes.
Transforms modify notes in place — previous transforms are already baked in. Don't re-apply earlier transforms.
MIDI params ignored for audio clips, vice versa.
On update-clip and duplicate, transforms/code is one string broadcast across every clip/copy. \`clip.index\`/\`clip.count\` span the full batch — use \`clip.index\` arithmetic (e.g. \`pitch += clip.index * 12\`) or \`clipseq()\` (e.g. \`pitch += clipseq(0, 5, 7)\`) inside the string for per-clip variation. For structurally-distinct edits per clip (different operations, not just different values), make separate tool calls.

**update-clip pipeline:** \`preTransforms → notes (merge) → transforms\`. \`transforms\` mutates the final result (after the merge). \`preTransforms\` mutates the existing notes BEFORE new \`notes\` land — use it to clear or modify a region you're about to rewrite in one call (e.g. \`preTransforms: "1|1-1|4: velocity = 0"\` with \`notes:\` to swap out bar 1). preTransforms also works on its own — no \`notes\` — to clear or edit notes in place; it's ignored only on audio clips. Same syntax as transforms. **Default to \`preTransforms\` for any delete/edit of notes already in the clip** (a region, a lane, or everything) instead of rebuilding \`notes\` or scattering \`v0\`s.
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

\`arrangementStart\` moves arrangement clips; \`toSlot\` (trackIndex/sceneIndex, e.g., "2/3") moves session clips. Moving clips changes their IDs - re-read to get new IDs.
\`arrangementLength\` sets arrangement playback region. \`split\` divides arrangement clips at bar|beat positions.

### Take Lanes (Arrangement Variations)

Stack alternate takes of an arrangement clip at the same position; only the active take plays (the user auditions/comps in Live's UI).

- \`takeLane\` on create-clip + duplicate (arrangement only; duplicate is MIDI-only): omit/\`0\` = main lane; \`1+\` = that lane (auto-created up to it); \`"new"\` = append a fresh lane. \`takeLaneName\` names a lane this call creates.
- Variation workflow: a few duplicate calls with \`takeLane: "new"\` + \`transforms\` to vary each copy. read-track \`arrangement-clips\` include lists \`takeLanes\` — each entry carries \`takeLane\` (1-based, matching the write param) and its \`name\`, so you can round-trip a read back to a write directly.
- 8 lanes/track max; creating over an existing clip replaces it (like the main lane). One-way: Producer Pal can't delete or comp take lanes — that's done in Live (expand the track's take-lane arrow to see them).
- Take-lane clips are append-only: \`update-clip\` (\`split\`, \`arrangementStart\`, \`arrangementLength\`) and \`ppal-delete\` warn+skip on them. Main→take duplicate recreates the clip from notes and drops envelope automation; take→main promote isn't supported. For any of these, ask the user to do it in Live's UI.
`;
