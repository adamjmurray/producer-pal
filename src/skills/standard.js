export const skills = `# Producer Pal Skills

You can now compose music in Ableton Live using Producer Pal tools and the bar|beat notation system.

## Time in Ableton Live

- Positions: bar|beat (1|1 = first beat, 2|3.5 = bar 2 beat 3.5, 1|2+1/3 = bar 1 beat 2 and a third)
- Durations: beats (2.5, 3/4, /4 = 1/4) or bar:beat (1:2 = 1 bar + 2 beats, 4:0 = 4 bars)
- Fractional beats: decimals (2.5), fractions (5/2), or mixed numbers (2+1/3) for both positions and durations
- Fraction shortcut: numerator defaults to 1 when omitted (/4 = 1/4, /3 = 1/3)

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
    - \`1|1x3@1/3\` or \`1|1x3@/3\` → triplets at 1, 4/3, 5/3 (explicit step)
    - \`t1/3 1|1x3\` or \`t/3 1|1x3\` → triplets at 1, 4/3, 5/3 (step = duration)
    - \`1|1x16@1/4\` or \`1|1x16@/4\` → full bar of 16ths (explicit step)
    - \`t1/4 1|1x16\` or \`t/4 1|1x16\` → full bar of 16ths (step = duration)
- v<velocity>: Note intensity from 0-127 (default: v100)
  - Single value: v100 (all notes at velocity 100)
  - Random range: v80-120 (each note gets random velocity between 80-120)
  - Use ranges for humanization, natural dynamics, and groove feel
  - \`v0\` deletes earlier notes at same pitch/time (**deletes until disabled** with non-zero v)
- t<duration>: Note length (default: 1.0)
  - Beat-only: t2.5 (2.5 beats), t3/4 (0.75 beats), t/4 (0.25 beats), t2+3/4 (2 and three-quarter beats)
  - Bar:beat: t2:1.5 (2 bars + 1.5 beats), t1:/4 (1 bar + 0.25 beats), t1:2+1/3 (1 bar + 2 and a third beats)
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
t/3 C3 1|1x3 // same as above (numerator defaults to 1)
t1/3 C3 1|1,4/3,5/3 // same as above (fractional notation)
t1/4 Gb1 1|1x16 // full bar of 16th note hi-hats (step = duration)
t/4 Gb1 1|1x16 // same as above (numerator defaults to 1)
t1+1/4 C3 D3 E3 1|1,1+1/3,1+2/3 // mixed numbers for natural musician notation
C3 D3 1|1 v0 C3 1|1 // delete earlier C3 (D3 remains)
C3 E3 G3 1|1,2,3,4 v0 C3 E3 G3 1|2 // delete chord at beat 2 only
C3 D3 1|1 @2=1 v0 D3 2|1 // bar copy then delete D3 from bar 2
v90-110 C1 1|1,3 D1 |2,4 // humanized drum pattern
v60-80 Gb1 1|1.5,2.5,3.5,4.5 // natural hi-hat feel
p0.5 C1 1|1,2,3,4 // 50% chance each kick plays
p1.0 D1 1|2,4 // back to 100% - snare always plays
\`\`\`

## Techniques

### Repeating Patterns

Use repeat syntax (\`x{times}[@{step}]\`), copy features, and pitch persistence:
- **Repeat syntax**: Best for regular subdivisions (16ths, triplets, every beat)
  - \`t1 C1 1|1x4\` for kicks on every beat (step = duration)
  - \`t0.5 Gb1 1|1x8\` for eighth notes (step = duration)
  - \`t1/3 C3 1|1x3\` or \`t/3 C3 1|1x3\` for triplets (step = duration)
  - Step is optional - omit @step to use current duration
  - Explicit step still works: \`C1 1|1x4@1\`, \`Gb1 1|1x8@0.5\`, \`C3 1|1x3@1/3\` or \`C3 1|1x3@/3\`
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
