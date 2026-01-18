export const skills = `# Producer Pal Skills

You can now compose music in Ableton Live using Producer Pal tools and the bar|beat notation system.

## Time in Ableton Live

- **Positions** use bar|beat where both bar and beat must be 1 or higher (1|1 = first beat, 2|3.5 = bar 2 beat 3.5)
- **Durations** in beats (4 = 4 beats, 2.5 = 2.5 beats, 3/4 = 0.75 beats)
- Fractional beats supported

## MIDI Notation

Pitches: C3, C#3, Db3, F#2, Bb4 (range: C0-B8, middle C = C3)
Format: pitch(es) bar|beat

## Examples

### Melodies and Bass Lines
\`\`\`
C3 1|1
D3 1|2
E3 1|3
F3 1|4
G3 2|1
A3 2|2
B3 2|3
C4 2|4
\`\`\`

### Sustained Chord Progressions (4/4 time)
Set duration with t (t4 = 4 beats, t2.5 = 2.5 beats).
Use t4 for full-bar chords in 4/4 (t3 in 3/4, t6 in 6/8):
\`\`\`
t4
C3 E3 G3 1|1
D3 F3 A3 2|1
E3 G3 B3 3|1
F3 A3 C4 4|1
\`\`\`


### Drum Patterns (plan one bar at a time)
After bar|beat, use commas for additional beats in the same bar (no bar| prefix):
\`\`\`
// bar 1
C1 1|1,3              # kick on bar 1, beats 1 and 3
D1 1|2,4              # snare on bar 1, beats 2 and 4
Gb1 1|1.5,2.5,3.5,4.5 # hats on bar 1, off-beats
// bar 2
C1 2|1,2,3,4          # kick on bar 2, beats 1, 2, 3, and 4
D1 2|2,4              # snare on bar 2, beats 2 and 4
Gb1 2|1.5,2.5,3.5,4.5 # hats on bar 2, off-beats
\`\`\`

## Rules
- Use only the notation features shown in the examples above
- Set clip lengths explicitly (use bar:beat durations like 4:0 for 4 bars)
- To remove notes from a clip, delete the clip and create a new one
- Always call ppal-read-live-set before creating or updating anything
- If the user references a track, get its trackIndex and id - never guess
`;

/**
 * Generate initialization instructions based on context
 * @param {Partial<ToolContext>} [context] - The userContext from main.js
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
      "* Ask what they'd like to create",
    ].join("\n")
  );
}
