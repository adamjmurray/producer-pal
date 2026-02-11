// Producer Pal
// Copyright (C) 2026 Adam Murray
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
- \`location\`: { view, sceneIndex?, arrangementStart? }
- \`liveSet\`: { tempo, scale?, timeSignature }
- \`beatsPerBar\`: number

**Processing order:** notes → transforms → code. When \`notes\` and \`code\` are both provided, notes are parsed and transforms applied first. Code then receives those notes and can further transform them.`;

export const skills = `# Producer Pal Skills

## Time in Ableton Live

- Positions: bar|beat (1-indexed). Examples: 1|1, 2|3.5, 1|2+1/3
- Durations: beats (2.5, 3/4, /4) or bar:beat (1:2, 4:0)
- Fractional beats: decimals (2.5), fractions (5/2), mixed (2+1/3). Numerator defaults to 1 (/4 = 1/4)

## MIDI Syntax

Create MIDI clips using the bar|beat notation syntax:

\`[v0-127] [t<duration>] [p0-1] note(s) bar|beat\`

- Notes emit at time positions (bar|beat)
  - time positions are relative to clip start
  - \`|beat\` reuses current bar
  - beat can be a comma-separated (no whitespace) list or repeat pattern
  - **Repeat patterns**: \`{beat}x{times}[@{step}]\` generates sequences (step optional, defaults to duration)
    - \`1|1x4@1\` → beats 1,2,3,4; \`t0.5 1|1x4\` → 1, 1.5, 2, 2.5 (step = duration)
    - \`1|1x3@/3\` → triplets; \`t/4 1|1x16\` → full bar of 16ths
- v<velocity>: 0-127 (default: v100). Range v80-120 randomizes per note for humanization
  - \`v0\` deletes earlier notes at same pitch/time (**deletes until disabled** with non-zero v)
- t<duration>: Note length (default: 1.0). Beats: t2.5, t3/4, t/4. Bar:beat: t2:1.5, t1:/4
- p<chance>: Probability from 0.0 to 1.0 (default: 1.0 = always)
- Notes: C0-B8 with # or b (C3 = middle C)
- Parameters (v/t/p) and pitch persist until changed
- copying bars (**MERGES** - use v0 to clear unwanted notes):
  - @N= copies previous bar; @N=M copies bar M to N; @N-M=P copies bar P to range
  - @N-M=P-Q tiles bars P-Q across range; @clear clears copy buffer
  - Copies frozen note parameters, not current v/t/p state

## Audio Clips
\`ppal-read-clip\` includes: \`sampleFile\`, \`gainDb\` (dB, 0=unity), \`pitchShift\` (semitones), \`sampleLength\`, \`sampleRate\`.
Audio params ignored when updating MIDI clips.

## Examples

\`\`\`
C3 E3 G3 1|1 // chord at bar 1 beat 1
C3 E3 G3 1|1,2,3,4 // same chord on every beat
C1 1|1x4@1 // kick on every beat (explicit step)
v100 C3 1|1 D3 |2.5 // C at beat 1, D at beat 2.5 (pitch persistence)
t0.25 C3 1|1.75 // 16th note at beat 1.75
t1/3 C3 1|1x3 // triplet eighth notes (step = duration)
t/4 Gb1 1|1x16 // full bar of 16th note hi-hats
t1+1/4 C3 D3 E3 1|1,1+1/3,1+2/3 // mixed numbers
C3 D3 1|1 v0 C3 1|1 // delete earlier C3 (D3 remains)
C3 D3 1|1 @2=1 v0 D3 2|1 // bar copy then delete D3 from bar 2
v90-110 C1 1|1,3 D1 |2,4 // humanized drum pattern
v60-80 Gb1 1|1.5,2.5,3.5,4.5 // natural hi-hat feel
p0.5 C1 1|1,2,3,4 // 50% chance each kick plays
p1.0 D1 1|2,4 // back to 100% - snare always plays
\`\`\`

## Techniques

Group by instrument per bar (pitch persistence). Complete bars before copying. Use beat lists for irregular patterns.

\`\`\`
C1 1|1,3 D1 |2,4 // bar 1
@2-3=1           // bar 1 -> 2,3
C1 4|1,3.5 D1 |4 // bar 4
@5-7=1           // bar 1 -> 5,6,7
@8=4             // bar 4 -> 8
\`\`\`

### Repeats with Variations

Copy foundation to **all bars** (including variation bars), then modify:

\`\`\`
C1 1|1,3 D1 |2,4               // bar 1 foundation
Gb1 |1.5,2.5,3.5,4.5
@2-16=1                        // copy to ALL bars, not just 2-8
v0 Gb1 9|4.5 v100              // remove hat from bar 9
C1 |3.5                        // add extra kick to bar 9
v0 C1 13|3 v100 D1 |3          // replace kick with snare in bar 13
\`\`\`

### Multi-bar phrases

Use cross-bar beat lists then tile the range:

\`\`\`
// 2-bar syncopated phrase
C1 1|1,3.5,5,7.5,8 // kick pattern across bars 1-2
D1 1|4,6           // snare accents across bars 1-2
@3-8=1-2           // tile 2-bar phrase across bars 3-8 (3 complete tiles)
\`\`\`

### v0 Deletion State Machine

v0 enters deletion mode - removes notes at same pitch until non-zero velocity:

\`\`\`
v100 C3 1|1 C3 2|1 v0 C3 1|1 C3 2|1 // deletes BOTH (still in deletion mode)
v80 C3 3|1                           // v80 exits deletion, this C3 kept
\`\`\`

### Transforms

Add \`transforms\` parameter to create-clip or update-clip.

**Syntax:** \`[selector:] parameter operator expression\` (one per line)
- **Selector:** pitch and/or time filter, followed by \`:\` - e.g., \`C3:\`, \`1|1-2|4:\`, \`C3 1|1-2|4:\`, \`1|1-2|4 C3:\`
- **Pitch filter:** \`C3\` (single) or \`C3-C5\` (range) - omit for all pitches
- **Time filter:** \`1|1-2|4\` (bar|beat range, inclusive, matches note start time)
- **MIDI parameters:** velocity (1-127), pitch (0-127), timing (beats), duration (beats), probability (0-1), deviation (-127 to 127)
- **Audio parameters:** gain (-70 to 24 dB), pitchShift (-48 to 48 semitones)
- **Operators:** \`+=\` (add to value), \`=\` (set value)
- **Expression:** arithmetic (+, -, *, /, %) with numbers, waveforms, math functions, and current values
- **Math functions:** round(x), floor(x), abs(x), min(a,b,...), max(a,b,...)

**Waveforms** (-1.0 to 1.0, per note position; once for audio):
- \`cos(freq)\`, \`tri(freq)\`, \`saw(freq)\`, \`square(freq)\` - periodic waves
- \`rand([min], [max])\` - random value (no args: -1 to 1, one arg: 0 to max, two: min to max)
- \`choose(a, b, ...)\` - random selection from arguments
- \`ramp(start, end)\` - linear interpolation over time range (or whole clip if no time selector)
- \`curve(start, end, exp)\` - exponential ramp (exp>1: slow start, exp<1: fast start, 1: linear)
- Frequency uses period notation: \`1t\` = 1 beat, \`1:0t\` = 1 bar, \`0:2t\` = 2 beats

**Current values:** \`note.pitch\`, \`note.velocity\`, \`note.start\`, \`note.duration\`, \`note.probability\`, \`note.deviation\` (MIDI), \`audio.gain\`, \`audio.pitchShift\` (audio)

\`\`\`
velocity += 20 * cos(2t)       // cycle every 2 beats
timing += 0.05 * rand()        // humanize timing
velocity += ramp(0, 60)        // fade in over clip
C1-C2: velocity += 30          // accent bass notes
1|1-2|4: velocity = 100        // forte in bars 1-2
velocity = note.velocity / 2   // halve existing velocity
velocity = max(60, note.velocity) // ensure minimum velocity
gain = audio.gain - 6          // reduce audio clip by 6 dB
\`\`\`

\`+=\` compounds on repeated calls; \`=\` is idempotent. Use update-clip with only transforms to modify existing notes.
Cross-type params ignored.
${process.env.ENABLE_CODE_EXEC === "true" ? codeTransformsSkills : ""}
## Working with Ableton Live

**Views and Playback:**
- Session View: Jam, try ideas, build scenes
  - Use auto:"play-scene" when generating clips; warn user about clip restarts
- Arrangement View: Structure songs on a timeline
  - Session clips override Arrangement; use "play-arrangement" for arrangement playback

**Creating Music:**
- Check for instruments before creating MIDI clips
- Clip length sets playback region; noteCount shows notes within that region
- Use velocity dynamics (pp=40, p=60, mf=80, f=100, ff=120) for expression
- Keep fills rhythmic with space - accent key hits, avoid machine-gun density
- Keep scenes' harmonic rhythm in sync across tracks
- Beats beyond time signature wrap to next bar (in 4/4: 1|5 = 2|1). Be explicit crossing bars: \`C1 1|1 2|1\` not \`C1 1|1,5\`
- Bass needs monophonic lines, one note at a time

**Layering:** To layer tracks on one instrument, duplicate with routeToSource=true. New track controls the same instrument.

**Staying in Sync:** Set clip lengths explicitly. After user rearranges in Live, call ppal-read-live-set.

### Device Paths

Slash-separated segments: \`t\`=track, \`rt\`=return, \`mt\`=master, \`d\`=device, \`c\`=chain, \`rc\`=return chain, \`p\`=drum pad

- \`t0/d0\` = first device on first track
- \`rt0/d0\` = first device on Return A
- \`mt/d0\` = first device on master track
- \`t0/d0/c0/d0\` = first device in rack's first chain
- \`t0/d0/rc0/d0\` = first device in rack's return chain
- \`t0/d0/pC1/d0\` = first device in Drum Rack's C1 pad

### Arrangement Clips

\`arrangementStart\` moves clips; \`arrangementLength\` sets playback region. Moving clips changes their IDs - re-read to get new IDs.

#### Lengthening Clips

Clips are duplicated/tiled to fill requested length (multiple clips, same playback result).

#### Moving Multiple Clips

Process in reverse \`arrangementStart\` order to prevent overwrites:
- bar 5 → 6, bar 4 → 5, bar 3 → 4
`;

/**
 * Generate initialization instructions based on context
 * @param context - The userContext from main.js
 * @returns Instructions for completing Producer Pal initialization
 */
export function buildInstructions(context?: Partial<ToolContext>): string {
  const memory = context?.memory;

  return (
    "Do this now to complete Producer Pal initialization:\n" +
    [
      "* Call ppal-read-live-set _with no arguments_ to sync with the state of Ableton Live",
      "* Summarize the Live Set (if ppal-read-live-set fails, say the error and summarize what you can, don't try again)",
      ...(memory?.content
        ? [
            `* Summarize the project memory, ${
              memory.writable ? "mention you can update the memory, " : ""
            }and verify you will follow instructions in memory (if any).`,
          ]
        : []),
      "* Say the messagesForUser, ask what's next, wait for input",
    ].join("\n")
  );
}
