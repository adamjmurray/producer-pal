// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

const codeTransformsSkills = `

### Code Transforms

For complex logic beyond transforms, use the \`code\` parameter with JavaScript. The \`code\` value is the function body only. It runs as:
\`(function(notes, context) { <code> })(notes, context)\`

Example \`code\` value:
\`\`\`javascript
return notes.filter(n => n.pitch >= 60).map(n => ({
  ...n,
  velocity: Math.min(127, n.velocity + 20)
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
- \`clip\`: { id, name, length, timeSignature, looping }
- \`location\`: { view, slot?, arrangementStart? }
- \`liveSet\`: { tempo, scale?, timeSignature }
- \`beatsPerBar\`: number

**Processing order:** notes → transforms → code. When \`notes\` and \`code\` are both provided, notes are parsed and transforms applied first. Code then receives those notes and can further transform them.
`;

export const skills = `# Producer Pal Skills

## Time in Ableton Live

- Positions: bar|beat (1-indexed). Examples: 1|1, 2|3.5, 1|2+1/3
- Durations: beats (2.5, 3/4, /4) or bar:beat (1:2, 4:0)
- Fractional beats: decimals (2.5), fractions (5/2), mixed (2+1/3). Numerator defaults to 1 (/4 = 1/4)

## MIDI Syntax

Create MIDI clips using the bar|beat notation syntax:

\`[v0-127] [t<duration>] [p0-1] note(s) bar|beat\`

- Parameters (v/t/p), pitches, and positions can appear in any order and be interspersed
- Notes emit at time positions (bar|beat)
  - time positions are relative to clip start
  - the beat in bar|beat can be a comma-separated (no whitespace) list or repeat pattern
  - **Repeat patterns**: \`{bar|beat}x{count}[@{step}]\` generates sequences. count = how many notes
    - step (in beats) defaults to duration (legato). step > duration = gaps; step < duration = overlap
    - \`1|1x4@1\` → beats 1,2,3,4; \`t0.5 1|1x4\` → 1, 1.5, 2, 2.5 (step defaults to t value)
    - \`1|1x3@/3\` → triplets; \`t/4 1|1x16\` → 16 notes at 16th-note spacing (x16 = count, t/4 = spacing)
- v<velocity>: 0-127 (default: v100). Range v80-120 randomizes per note for humanization
  - \`v0\` deletes earlier notes at same pitch/time (**deletes until disabled** with non-zero v)
- t<duration>: Note length (default: 1.0). Beats: t2.5, t3/4, t/4. Bar:beat: t2:1.5, t1:/4
- p<chance>: Probability from 0.0 to 1.0 (default: 1.0 = always)
- Notes: C0-G8 with # or b for sharps/flats (C#3, Bb2). C3 = middle C
- **Stateful**: v/t/p and pitch persist until changed — set once, applies to all following notes
- copying bars (**MERGES** - use v0 to clear unwanted notes):
  - @N= copies previous bar; @N=M copies bar M to N; @N-M=P copies bar P to range
  - @N-M=P-Q tiles bars P-Q across range; @clear clears copy buffer
  - Copies capture each note's v/t/p at the time it was written, not the current state
- **update-clip** \`noteUpdateMode\`: "merge" (default, overlay + v0 deletes) or "replace" (clear all existing notes first)

## Audio Clips
\`ppal-read-clip\` \`sample\` include: \`sampleFile\`, \`gainDb\` (dB, 0=unity), \`pitchShift\` (semitones). \`warp\` include: \`sampleLength\`, \`sampleRate\`, \`warping\`, \`warpMode\`.
Audio params ignored when updating MIDI clips.

## Examples

\`\`\`
C#3 F3 G#3 1|1 // chord at bar 1 beat 1
C3 E3 G3 1|1,2,3,4 // same chord on every beat
C1 1|1,3 2|1,2,3 // same pitch across bars (NOT 1|1,3,2|1,2,3)
t0.25 C3 1|1.75 // 16th note at beat 1.75
t1/3 C3 1|1x3 // triplets: 3 notes across 1 beat (step = duration)
t/4 Gb1 1|1x16 // full bar of 16th note hi-hats
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

**Syntax:** \`[selector:] parameter operator expression\` (one per line)
- **Selector:** pitch and/or time filter, followed by \`:\` - e.g., \`C3:\`, \`1|1-2|4:\`, \`C3 1|1-2|4:\`, \`1|1-2|4 C3:\`
- **Pitch filter:** \`C3\` (single) or \`C3-C5\` (range) - omit for all pitches
- **Time filter:** \`1|1-2|4\` (bar|beat range, inclusive, matches note start time)
- **MIDI parameters:** velocity (1-127; <=0 deletes note), pitch (0-127), timing (beats), duration (beats; <=0 deletes note), probability (0-1), deviation (-127 to 127)
- **Audio parameters:** gain (-70 to 24 dB), pitchShift (-48 to 48 semitones)
- **Operators:** \`+=\`, \`-=\` (add/subtract), \`*=\`, \`/=\` (scale current value), \`=\` (set)
- **Expression:** arithmetic (+, -, *, /, %) with numbers, waveforms, math functions, and current values
- **Math functions:** round(x), floor(x), ceil(x), abs(x), clamp(val,min,max), wrap(val,min,max) (wrap to inclusive range), reflect(val,min,max) (bounce within inclusive range), min(a,b,...), max(a,b,...), pow(base,exp), snap(pitch) (snap to Live Set scale; no-op if no scale), step(pitch, offset) (move by offset scale steps; even distribution for waveforms), legato([tolerance]) (set duration to reach next note's start time; optional tolerance in beats groups nearby starts as chords, e.g. legato(0.1) after humanizing)
- **Timing functions:** swing(amount [, grid] [, raw]) (auto-quantizes to grid then applies swing; amount=delay in beats: 0.02=subtle, 0.05=medium, 0.1=heavy; grid: default 1/2t=8th-note swing, 1/4t=16th-note swing; raw: skip auto-quantize), quant(grid) (snap to nearest grid point). Grid ref for both: 1t=quarter, 1/2t=8th, 1/4t=16th, 1/3t=triplet. Both return absolute positions — use \`timing =\`, not \`timing +=\`

**Waveforms** (-1.0 to 1.0, per note position; once for audio):
- \`cos(period)\`, \`square(period)\` - start at peak (1.0); \`sin(period)\`, \`tri(period)\`, \`saw(period)\` - start at zero, rise to peak
  - All accept optional phase offset: \`cos(1t, 0.25)\`. square adds pulse width (3rd arg): \`square(1t, 0, 0.75)\` (phase=0, 75% duty cycle)
- \`rand([min], [max])\` - random value (no args: -1 to 1, one arg: 0 to max, two: min to max)
- \`seq(a, b, ...)\` - cycle through values by note.index (MIDI) or clip.index (audio)
- \`choose(a, b, ...)\` - random selection from arguments
- \`ramp(start, end)\` - linear interpolation; reaches end value at time range end (or clip end)
- \`curve(start, end, exp)\` - exponential (exp>1: slow start, exp<1: fast start); reaches end value at time range end
- For ramp/curve, end the time filter on the last note's beat position so it reaches its end value. In 4/4: last 8th=N|4.5, last 16th=N|4.75
- Waveform period: \`1t\` = 1 beat cycle, \`1:0t\` = 1 bar cycle, \`0:2t\` = 2 beat cycle
- \`sync\` keyword (last arg on periodic waves) syncs phase to arrangement timeline instead of clip start

**Variables:** \`note.pitch\`, \`note.velocity\`, \`note.start\`, \`note.duration\`, \`note.probability\`, \`note.deviation\`, \`note.index\` (time-ordered), \`note.count\` (MIDI), \`next.pitch\`, \`next.velocity\`, \`next.start\`, \`next.duration\` (next distinct-start note; skips chords; warns on last note), \`audio.gain\`, \`audio.pitchShift\` (audio), \`clip.duration\`, \`clip.index\` (order of ids), \`clip.count\`, \`clip.position\` (arrangement only), \`clip.barDuration\` (all clips)

\`\`\`
timing = swing(0.05)             // swing (auto-quantizes). Use swing() alone unless asked for a specific grid
timing = quant(1/2t)             // snap to 8th-note grid (half a beat)
timing = quant(1/4t)             // snap to 16th-note grid (quarter beat)
timing += 0.05 * rand()          // humanize timing
velocity += 20 * cos(2t)         // cycle every 2 beats
velocity += 20 * cos(4:0t, sync) // continuous across clips
1|1-4|4.75: velocity = ramp(40, 127) // crescendo over 4 bars (16th grid)
C1-C2: velocity += 30            // accent bass notes
1|1-2|4: velocity = 100          // forte in bars 1-2
velocity = seq(100, 60, 80, 60)  // cycle accents per note
Gb1: pitch = seq(Gb1, Gb1, Gb1, Gb1, Ab1) // every 5th closed hat → open hat
gain = audio.gain - 6            // reduce audio clip by 6 dB
pitch = snap(note.pitch + 7) // transpose up fifth, snap to scale
pitch = step(note.pitch, sin(4t) * 7) // oscillate ±7 scale steps smoothly
pitch = wrap(note.pitch + 5, C3, C5) // transpose up 5, wrap within C3-C5
velocity *= 0.5                  // halve all velocities
C1-C2: duration /= 2             // halve duration of bass notes
duration = legato()              // extend each note to reach the next
duration = legato(0.1)           // legato with tolerance (after humanizing timing)
\`\`\`

swing() auto-quantizes to the swing grid, so changing swing amount is always safe without a separate quant() step. Use \`raw\` to skip auto-quantize: \`swing(0.05, raw)\`

\`+=\` compounds on repeated calls; \`=\` is idempotent. \`*=\`/\`/=\` scale the current value (\`timing *=\` scales absolute note position). Use update-clip with only transforms to modify existing notes.
Transforms modify notes in place — previous transforms are already baked in. Don't re-apply earlier transforms.
MIDI params ignored for audio clips, vice versa.
On duplicate, transforms/code apply per-copy (not the source). With multiple copies, \`clip.index\`/\`clip.count\` span the copies — use \`seq()\` for variations (e.g. transpose each copy differently).
${process.env.ENABLE_CODE_EXEC === "true" ? codeTransformsSkills : ""}
## Finding Library Content

Use \`ppal-library\` to search Live's browser library and the user's configured sample folder.

- Defaults to audio samples (the only kind loadable into clips/Simpler today). Other \`kind\` values are discovery-only.
- \`query\` is a name substring; use \`*\` as a multi-character wildcard (e.g., \`kick*acoustic\`).
- \`tags\` is comma-separated; results must match ALL listed tags. Use \`action: "listTags"\` to discover available tags.
- \`source\`: filter where the file lives. \`sampleFolder\` is the user-configured sample folder on disk (bypasses Live's DB); \`user\`, \`pack\`, \`builtin\`, \`cloud\`, \`plugin\` query Live's DB.
- Items from the user's sample folder appear before Live's library items in results.
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

**Simpler sample:** Load a sample with \`params: "sample=<absolute file path>"\` on ppal-create-device or ppal-update-device. Read-device returns the loaded path as a top-level \`sample\` field and (when params are included) as a \`{name: "sample", value: <path>}\` entry in \`parameters\`. Skipped with a warning on non-Simpler devices and on Simpler in multi-sample mode.

**Build a Drum Rack:** Create the rack (\`deviceName="Drum Rack"\`), then one ppal-create-device call per pad: \`deviceName="Simpler" path="t0/d0/p<Note>/d0" name="<PadName>" params="sample=<abs path>"\`. The note name addresses the pad (\`pC1\`, \`pF#1\`); its chain auto-creates, and \`params="sample=..."\` loads the sample into the Simpler in the same call — no separate sample step. One call per pad (each takes a different sample). Standard layout: 16 pads chromatically from C1 up to D#2/Eb2. Get paths from \`ppal-library\`; to match an existing kit's pad notes, read the track with \`drum-map\` first.

### Specialized Device Controls

Some native devices expose class-level controls beyond their DeviceParameters. These flow through existing surfaces: **pseudo-params** (set via \`params\` name=value lines, read back in \`parameters\`), **\`actions\`** (function-call strings on update-device), dynamic catalogs and (Wavetable) current mod routes via read-device \`include: ["options"]\`. Invalid enum values warn-and-skip and list the valid options.

Instruments:

- **Drift** mod matrix. Source slots \`filterMod1Source\` \`filterMod2Source\` \`lfoSource\` \`pitchMod1Source\` \`pitchMod2Source\` \`shapeSource\` \`mod1Source\` \`mod2Source\` \`mod3Source\` take: Env 1, Env 2, LFO, Key, Vel, Mod, Press, Slide. Free-slot targets \`mod1Target\` \`mod2Target\` \`mod3Target\` take: None (disables), Osc 1 Gain, Osc 1 Shape, Osc 2 Gain, Osc 2 Detune, Noise Gain, LP Frequency, LP Resonance, HP Frequency, LFO Rate, Cyc Env Rate, Main Volume. Also set the matching amount DeviceParameter (e.g. \`Mod Matrix Amt 1\`). Plus \`voiceMode\` (Poly/Mono/Stereo/Unison), \`voiceCount\` (4/8/16/24/32), \`pitchBendRange\` (0-12).
- **Wavetable** \`filterRouting\` (serial/parallel/split), \`monoPoly\` (mono/poly), \`polyVoices\` (2/3/4/5/6/7/8/16), \`unisonMode\` (none/classic/shimmer/noise/phase-sync/position-spread/random-note), \`unisonVoiceCount\` (2-8), \`osc1Engine\`/\`osc2Engine\` (None/Fm/Classic/Modern), \`osc1Category\`/\`osc2Category\` + \`osc1Wavetable\`/\`osc2Wavetable\` (set category first; browse via options \`oscWavetableCategories\`, then \`osc1Wavetables\`/\`osc2Wavetables\` list the selected category's tables). Mod matrix via actions: \`setModulation('<targetParamName>', '<source>', <amount -1..1>)\`, \`clearModulation('<targetParamName>', '<source>')\`, \`addModulationTarget('<paramName>')\`. Sources: Amp, Env 2, Env 3, LFO 1, LFO 2, Vel, Key, PB, Press, Mod, Rand, Note PB, Slide. read-device \`include: ["options"]\` returns current routes (\`modulations\`) and \`modulatableParameters\`.
- **Meld** \`monoPoly\` (mono/poly), \`polyVoices\` (1-6), \`unisonVoices\` (0-2).
- **Simpler** \`playbackMode\` (classic/one-shot/slicing), \`slicingPlaybackMode\` (mono/poly/thru), \`retrigger\`, \`voices\`; read-only \`multiSampleMode\`, \`estimatedPlaybackLength\`. Actions \`reverse\`, \`crop\`, \`warpDouble\`, \`warpHalf\`, \`warpAs(<beats>)\` operate on the active region — set the \`S Start\`/\`S Length\` DeviceParameters first to target a sub-range.

Audio effects:

- **Compressor** sidechain: \`sidechainSourceTrackId\` (a trackId, or null for No Input) and \`sidechainChannel\` (Pre FX/Post FX/Post Mixer). Apply source before channel. options lists valid \`sidechainSourceTrackIds\`.
- **EQ Eight** \`globalMode\` (stereo / L/R / M/S), \`oversample\`. In L/R the A bands process Left and B bands Right; in M/S, A = Mid and B = Side. Set \`globalMode\`, then write the A-/B-suffix band DeviceParameters (e.g. \`5 Frequency B\`).
- **Hybrid Reverb** \`irCategory\`, \`irFile\` (set category first; browse via options \`irCategoryList\`, then \`irFileList\` lists the selected category's files), \`irAttackTime\`, \`irDecayTime\`, \`irSizeFactor\`, \`irTimeShapingOn\`.
- **Roar** \`routingMode\` (single/serial/parallel/multi-band/mid-side/feedback/delay), \`envListen\`.
- **Spectral Resonator** \`midiGate\`, \`monoPoly\` (mono/poly), \`pitchBendRange\` (0-24), \`modMode\` (None/Chorus/Wander/Granular), \`pitchMode\` (Hertz / MIDI Note), \`polyphony\` (2/4/8/16).

### Moving Clips

\`arrangementStart\` moves arrangement clips; \`toSlot\` (trackIndex/sceneIndex, e.g., "2/3") moves session clips. Moving clips changes their IDs - re-read to get new IDs.
\`arrangementLength\` sets arrangement playback region. \`split\` divides arrangement clips at bar|beat positions.
`;
