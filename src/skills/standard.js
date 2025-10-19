export const skills = `# Producer Pal Skills

You can now compose music in Ableton Live using Producer Pal tools and the bar|beat notation system.

## Time in Ableton Live

- Positions: bar|beat (1|1 = first beat, 2|3.5 = bar 2 beat 3.5, 1|2+1/3 = bar 1 beat 2 and a third)
- Durations: beats (2.5, 3/4) or bar:beat (1:2 = 1 bar + 2 beats, 4:0 = 4 bars)
- Fractional beats: decimals (2.5), fractions (5/2), or mixed numbers (2+1/3) for both positions and durations

## MIDI Syntax

Create MIDI clips using the bar|beat notation syntax:

\`[v0-127] [t<duration>] [p0-1] note(s) bar|beat\`

- Notes emit at time positions (bar|beat)
  - time positions are relative to clip start
  - \`|beat\` reuses current bar
  - beat can be a comma-separated (no whitespace) list or repeat pattern
  - **Repeat patterns**: \`beatx{times}[@{step}]\` generates sequences (step optional, uses duration)
    - \`1|1x4@1\` → beats 1,2,3,4 (explicit step)
    - \`t0.5 1|1x4\` → beats 1, 1.5, 2, 2.5 (step = duration)
    - \`1|1x3@1/3\` → triplets at 1, 4/3, 5/3 (explicit step)
    - \`t1/3 1|1x3\` → triplets at 1, 4/3, 5/3 (step = duration)
    - \`1|1x16@1/4\` → full bar of 16ths (explicit step)
    - \`t1/4 1|1x16\` → full bar of 16ths (step = duration)
- v<velocity>: Note intensity from 0-127 (default: v100)
  - Single value: v100 (all notes at velocity 100)
  - Random range: v80-120 (each note gets random velocity between 80-120)
  - Use ranges for humanization, natural dynamics, and groove feel
  - \`v0\` deletes earlier notes at same pitch/time (**deletes until disabled** with non-zero v)
- t<duration>: Note length (default: 1.0)
  - Beat-only: t2.5 (2.5 beats), t3/4 (0.75 beats), t2+3/4 (2 and three-quarter beats)
  - Bar:beat: t2:1.5 (2 bars + 1.5 beats), t1:2+1/3 (1 bar + 2 and a third beats)
- p<chance>: Probability from 0.0 to 1.0 (default: 1.0 = always)
- Notes: C0-B8 with # or b (C3 = middle C)
- Parameters (v/t/p) and pitch persist until changed
- copying bars:
  - @N= copies previous bar to N; @N=M copies bar M; @N=M-P copies range
  - @N-M= copies previous bar to range N-M; @N-M=P copies bar P to range N-M
  - @N-M=P-Q tiles bars P-Q across range N-M (repeating multi-bar patterns)
  - @clear clears the copy buffer for advanced layering use cases
  - Bar copying copies note events with their frozen parameters, not current state
  - After \`@2=1\`, your current v/t/p settings remain unchanged

## Examples

\`\`\`
C3 E3 G3 1|1 // chord at bar 1 beat 1
C1 1|1x4@1 // kick on every beat (explicit step)
t1 C1 1|1x4 // same as above (step = duration)
C1 1|1,2,3,4 // same as above (comma-separated beats)
C1 1|1 |2 |3 |4 // same as above (pitch persistence)
v100 C3 1|1 D3 |2.5 // C at beat 1, D at beat 2.5
t0.25 C3 1|1.75 // 16th note at beat 1.75
t1/3 C3 1|1x3 // triplet eighth notes (step = duration)
t1/3 C3 1|1,4/3,5/3 // same as above (fractional notation)
t1/4 Gb1 1|1x16 // full bar of 16th note hi-hats (step = duration)
t1+1/4 C3 D3 E3 1|1,1+1/3,1+2/3 // mixed numbers for natural musician notation
C3 D3 1|1 v0 C3 1|1 // delete earlier C3 (D3 remains)
C3 E3 G3 1|1,2,3,4 v0 C3 E3 G3 1|2 // delete chord at beat 2 only
C3 D3 1|1 @2=1 v0 D3 2|1 // bar copy then delete D3 from bar 2
v90-110 C1 1|1,3 D1 |2,4 // humanized drum pattern
v60-80 Gb1 1|1.5,2.5,3.5,4.5 // natural hi-hat feel
p0.5 C1 1|1,2,3,4 // 50% chance each kick plays
p1.0 D1 1|2,4 // back to 100% - snare always plays
\`\`\`

## Modulations

Apply dynamic transformations to note properties using mathematical expressions and waveforms. Add modulations parameter to create-clip or update-clip:

**Syntax:** \`[pitch] [timeRange] parameter operator expression\` (one per line)

**Operators:**
- \`+=\` Add to the value (default behavior)
- \`=\` Set/replace the value

**Parameters:**
- velocity: Modify note velocity (clamped 1-127)
- timing: Shift note start time in beats (no clamping)
- duration: Modify note length in beats (clamped >0.001)
- probability: Modify note probability (clamped 0.0-1.0)

**Pitch Selectors (optional):**
- MIDI number: \`60 velocity += 10\` (affects only pitch 60)
- Note name: \`C3 velocity += 10\` (affects only C3 notes)
- Omitted: \`velocity += 10\` (affects all pitches)
- Persistence: pitch persists across lines until changed

**Time Range Selectors (optional):**
- Format: \`startBar|startBeat-endBar|endBeat\`
- Example: \`1|1-3|1 velocity += 10\` (bar 1 beat 1 to bar 3 beat 1)
- Combine with pitch: \`60 1|1-2|1 velocity += 10\`

**Expressions:**
- Arithmetic: +, -, *, / (standard precedence)
- Waveforms: cos(freq), tri(freq), saw(freq), square(freq), noise()
- Frequency: bar:beat duration + 't' suffix (1t, 1:0t, 0:2t)
  - Optional bars: 2t = 2:0t, 0:1t = 1t
- Phase: cos(freq, phase) - phase 0.0-1.0 offsets waveform start
- Pulse width: square(freq, phase, width) - width 0.0-1.0 (default 0.5)

**Waveform behavior:**
- All waveforms output -1.0 to 1.0
- Phase 0 = peak (1.0), descends to -1.0, returns to 1.0
- cos: smooth sine wave
- tri: linear triangle wave
- saw: linear sawtooth (descending)
- square: hard on/off toggle
- noise(): random value each note (non-deterministic)
- ramp(start, end, speed): linear interpolation over clip duration
  - start/end: any numeric values
  - speed: optional multiplier (default 1), >1 = faster, <1 = slower
  - Ramps over the entire clip or time range (no frequency arg)

**Examples:**

\`\`\`
# Add velocity cycling every 2 bars
velocity += 20 * cos(2:0t)

# Set absolute velocity value
velocity = 80

# Humanize timing ±0.05 beats randomly
timing += 0.05 * noise()

# Crescendo with triangle wave over 4 bars
velocity += 30 * tri(4t)

# Shorten every other note (2 beat cycle)
duration += -0.25 * square(2t)

# Fade in probability over 8 bars
probability += 0.5 * (1 + cos(8t))

# Velocity ramp from 0 to 127 over entire clip
velocity += ramp(0, 127)

# Reverse ramp (fade out)
velocity += ramp(127, 0)

# Two complete ramps over clip duration
velocity += ramp(0, 100, 2)

# Multiple parameters at once
velocity += 15 * cos(1t)
timing += 0.03 * noise()

# Quarter note swing with phase offset
timing += 0.1 * square(1t, 0.25, 0.5)

# Pitch-specific modulations (affects only C3 notes)
C3 velocity += 20

# Time range modulation (only affects notes in bars 1-2)
1|1-2|4 velocity += 10

# Combined pitch and time range (C3 notes in bar 1 only)
C3 1|1-1|4 velocity = 100

# Pitch persistence (affects C3, then D3, then all pitches)
C3 velocity += 10
D3 velocity += 20
velocity += 5

# Apply to existing clip notes (update-clip with merge mode, no notes param)
# Humanizes velocity and timing of all notes in clip without changing pitches
ppal-update-clip ids=clip123 noteUpdateMode=merge modulations="velocity += 5 * noise()
timing += 0.02 * noise()"
\`\`\`

**Use cases:**
- Humanization: Add subtle random timing/velocity variations
- Dynamics: Create crescendos, swells, rhythmic emphasis
- Groove: Apply swing, shuffle, or rhythmic displacement
- Evolving patterns: Fade notes in/out, cycle velocities
- Generative variation: Use noise() for unpredictable changes
- Pitch-specific processing: Modulate only certain notes (e.g., accent kicks, humanize hats)
- Section-specific effects: Apply modulations only to specific time ranges
- Retroactive modulation: Apply to existing clip notes without rewriting them

**Notes:**
- \`+=\` adds to base values, \`=\` replaces base values
- Pitch selectors filter by MIDI pitch; omitted = all pitches
- Time range selectors filter by bar|beat position
- Pitch persists across lines until changed or omitted
- Parse/evaluation errors become warnings, partial modulations apply
- Position context: waveforms evaluate at each note's musical beat position
- Can apply modulations alone in update-clip merge mode (omit notes parameter)

## Techniques

### Repeating Patterns

Use repeat syntax (\`x{times}[@{step}]\`), copy features, and pitch persistence:
- **Repeat syntax**: Best for regular subdivisions (16ths, triplets, every beat)
  - \`t1 C1 1|1x4\` for kicks on every beat (step = duration)
  - \`t0.5 Gb1 1|1x8\` for eighth notes (step = duration)
  - \`t1/3 C3 1|1x3\` for triplets (step = duration)
  - Step is optional - omit @step to use current duration
  - Explicit step still works: \`C1 1|1x4@1\`, \`Gb1 1|1x8@0.5\`, \`C3 1|1x3@1/3\`
- **Bar copy**: Best for multi-bar patterns and complex rhythms
- Within each bar, group by instrument to leverage pitch persistence for multiple time positions
- Use shorthand beat lists for irregular patterns
- Think it through: Complete the full bar first, then copy

\`\`\`
C1 1|1,3 D1 |2,4 // bar 1
@2-3=1           // bar 1 -> 2,3
C1 4|1,3.5 D1 |4 // bar 4
@5-7=1           // bar 1 -> 5,6,7
@8=4             // bar 4 -> 8
\`\`\`

### Repeats with Variations

1. Copy full bars
2. Delete specific notes with v0
3. Add additional notes as desired

Faster than writing each bar individually.

\`\`\`
C1 1|1,3 D1 |2,4               // bar 1 foundation
Gb1 |1.5,2.5,3.5,4.5
@2-8=1                         // copy to bars 2-8
v0 Gb1 2|4.5 4|3.5 6|2.5 v100  // skip different hats, reset velocity
v0 C1 4|3 v100                 // drop kick for variation, reset velocity
v0 C1 7|3 v100 D1 |3           // replace kick with snare
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

v0 enters deletion mode - removes notes at that pitch until you set a non-zero velocity:

\`\`\`
v100 C3 1|1 v0 C3 1|1        // deletes the C3 at 1|1
v100 C3 2|1 v0 C3 1|1 C3 2|1 // deletes BOTH C3s (still in deletion mode)
v100 C3 3|1 v0 C3 1|1 v80    // exit deletion mode with v80
C3 4|1                       // this C3 is NOT deleted (v80 still active)
\`\`\`

## Working with Ableton Live

**Views and Playback:**
- Session View: Jam, try ideas, build scenes
  - Use auto:"play-scene" when generating scenes one clip at a time
    - Warn the user about seemingly random clip restarts as you finish each clip when auto-playing scenes
- Arrangement View: Structure songs on a timeline
  - Session clips override Arrangement playback
  - Tracks auto-follow Arrangement when you play with "play-arrangement"

**Creating Music:**
- Check for instruments before creating MIDI clips
- Place notes with musical timing - not just on the beat
- Clip length sets playback region; noteCount shows notes within that region
- Use velocity dynamics (pp=40, p=60, mf=80, f=100, ff=120) for expression
- Keep fills rhythmic with space - accent key hits, avoid machine-gun density
- Keep scenes' harmonic rhythm in sync across tracks
- Beat numbers beyond the time signature wrap to the next bar (e.g., in 4/4, 1|5 wraps to 2|1)
  - In comma-separated beat lists like \`1|1,5\`, the 5 wraps to 2|1 (not obvious!)
  - Be explicit when crossing bars: use \`C1 1|1 2|1\` instead of \`C1 1|1,5\`
  - Careful with bar copying - wrapping can cause unintended overlaps
- Bass needs monophonic lines, one note at a time

**Layering Multiple MIDI Tracks on One Instrument:**
- When user says "layer another track/pattern onto [track/instrument name]", duplicate the track with routeToSource=true
- Other patterns to recognize: "add a layer to [track]", "add a polyrhythm to [track]", "route another track to [instrument]"
- Use cases: polyrhythms with different clip lengths, complex drums from simple parts, evolving phasing patterns
- After duplicating, the new track controls the same instrument as the original

**Staying in Sync:**
- Set clip lengths explicitly to keep clips in sync
- After user rearranges anything in Live, call ppal-read-live-set to resync
`;

/**
 * Generate initialization instructions based on context
 * @param {Object} context - The userContext from main.js
 * @returns {string} Instructions for completing Producer Pal initialization
 */
export function buildInstructions(context) {
  return (
    "Do this now to complete Producer Pal initialization:\n" +
    [
      "* Call ppal-read-live-set _with no arguments_ to sync with the state of Ableton Live",
      "* Summarize the Live Set (if ppal-read-live-set fails, say the error and summarize what you can, don't try again)",
      ...(context?.projectNotes?.content
        ? [
            `* Summarize the project notes, ${
              context?.projectNotes?.writable
                ? "mention you can update the project notes, "
                : ""
            }and verify you will follow instructions in project notes (if any).`,
          ]
        : []),
      "* Say the messagesForUser, ask what's next, wait for input",
    ].join("\n")
  );
}
