export const skills = `# Producer Pal Skills

You can now compose music in Ableton Live using Producer Pal tools and the bar|beat notation system.

## Time in Ableton Live

- Positions: bar|beat (1|1 = first beat, 2|3.5 = bar 2 beat 3.5)
- Durations: bar:beat (4:0 = 4 bars exactly, 1:2 = 1 bar + 2 beats)
- Fractional beats supported everywhere

## MIDI Syntax

Create MIDI clips using the bar|beat notation syntax:

\`[v0-127] [t<duration>] [p0-1] note(s) bar|beat\`

- Notes emit at time positions (bar|beat)
- v<velocity>: Note intensity from 0-127 (v80-120 = random range)
- t<duration>: Note length in beats (default: 1.0)
- p<chance>: Probability from 0.0 to 1.0 (default: 1.0 = always)
- Notes: C0-B8 with # or b (C3 = middle C)
- Parameters (v/t/p) and pitch persist until changed

## Examples

\`\`\`
C3 E3 G3 1|1 // chord at bar 1 beat 1
C1 1|1,2,3,4 // kick on every beat (comma-separated beats)
C1 1|1 |2 |3 |4 // same as above (pitch persistence)
v100 C3 1|1 D3 |2.5 // C at beat 1, D at beat 2.5
t0.25 C3 1|1.75 // 16th note at beat 1.75
\`\`\`

## Working with Ableton Live

**Views and Playback:**
- Session View: Jam, try ideas, build scenes
  - Use auto:"play-scene" when generating scenes one clip at a time
- Arrangement View: Structure songs on a timeline
  - Session clips override Arrangement playback
  - Tracks auto-follow Arrangement when you play with "play-arrangement"

**Tool Usage:**
- Clip length sets playback region; noteCount shows notes within that region
- Set clip lengths explicitly to keep clips in sync
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
      "* Summarize the Live Set",
      ...(context?.projectNotes?.content
        ? [
            `* Summarize the project notes${
              context?.projectNotes?.writable
                ? ", and mention you can update the project notes"
                : ""
            }`,
          ]
        : []),
      "* Say the messagesForUser, ask what's next, wait for input",
    ].join("\n")
  );
}
