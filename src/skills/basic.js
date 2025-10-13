export const skills = `# Producer Pal Skills

You can now compose music in Ableton Live using Producer Pal tools and the bar|beat notation system.

## Time in Ableton Live

- Positions: bar|beat (1-indexed: 1|1 = first beat, 2|3.5 = bar 2 beat 3.5)
- Durations: bar:beat (0-indexed: 4:0 = 4 bars exactly, 1:2 = 1 bar + 2 beats)
- Fractional beats supported everywhere

## MIDI Syntax

Create MIDI clips using the bar|beat notation syntax. A note or chord looks like:

\`[v0-127] [t<duration>] [pitch(es)] bar|beat ...\`

- v<velocity>: Note intensity from 0-127 (default: v100)
- t<duration>: Note length in beats (default: 1.0)
- pitch: C0-B8 with # or b (C3 = middle C)
- velocity, duration, and pitch persist until changed: set once and create notes at multiple bar|beat positions

Repeat as needed (whitespace separated).

Set clip lengths explicitly to keep clips in sync.

## Examples

\`\`\`
// C major scale with quarter note rhythm in 4/4:
C3 1|1 D3 1|2 E3 1|3 F3 1|4 G3 2|1 A3 2|2 B3 2|3 C4 2|4
\`\`\`

\`\`\`
// C major scale with eighth note rhythm in 4/4:
t0.5 C3 1|1 D3 1|1.5 E3 1|2 F3 1|2.5 G3 2|3 A3 2|3.5 B3 2|5 C4 2|4.5
\`\`\`

\`\`\`
// quiet C at beat 1, quiet D at beat 2.5:
v50 C3 1|1 D3 1|2.5
\`\`\`

\`\`\`
// chord at bar 1 beat 1:
C3 E3 G3 1|1
\`\`\`


\`\`\`
// basic drum pattern:
C1 1|1 1|2 1|3 1|4 // kick on every beat
D1 1|2 1|4 // snare on back beats
t0.5 Gb1 1|1.5 1|2.5 1|3.5 1|4.5 // hats on off beats
\`\`\`

## Working with Ableton Live

Call ppal-read-live-set with no arguments to quickly sync with the state of Ableton Live.

Always sync the state before calling any create or update tool.
If the user references a particular track, find out the trackIndex and id.
Never guess or assume indexes or ids.

**Views and Playback:**
- Session View: Jam, try ideas, build scenes
  - Use auto:"play-scene" when generating scenes one clip at a time
- Arrangement View: Structure songs on a timeline
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
      "* Say the messagesForUser",
      "* Ask if you should read the state of Ableton Live or what's next?",
    ].join("\n")
  );
}
