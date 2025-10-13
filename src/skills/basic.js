export const skills = `# Producer Pal Skills

You can now compose music in Ableton Live using Producer Pal tools and the Stark Notation system.

## Stark Notation

Ultra-minimal music notation for quick composition.

### Format

\`type: content\`

**Types:**
- Drum names (\`kick\`, \`snare\`, \`hihat\`, etc.) → drums mode
- \`bass\` → bass mode, lower register
- \`melody\` → melody mode, higher register
- \`chords\` → chord mode, harmonic progressions

### Core Rule: Spacing = Timing

- **Whitespace between tokens** = quarter notes
- **No whitespace** = 16th notes

### Drums Mode

\`\`\`
kick: X x X x
snare: . X . X
hihat: x x x x
\`\`\`

**Tokens:** \`X\`=loud, \`x\`=soft, \`^\`=accent, \`.\`=rest, \`-\`=sustain, \`/\`=next bar

**Drums:** \`kick\`, \`snare\`, \`hihat\`, \`open\`, \`tom1\`, \`tom2\`, \`tom3\`, \`ride\`, \`crash\`, \`clap\`, \`rimshot\`

### Bass/Melody Mode

\`\`\`
bass: C D E F G / G F E D C
melody: E G A / A G E
\`\`\`

**Tokens:** \`A-G\` (uppercase=loud, lowercase=soft), \`.\`=rest, \`-\`=sustain, \`/\`=next bar

**Scale adherence:** Letters auto-apply scale accidentals. No chromatic notes.
- In C Major: C D E F G A B
- In Ab Major: A→Ab, B→Bb, D→Db, E→Eb

**Octave handling:** Notes choose closest interval to previous note within range.

### Chords Mode

\`\`\`
chords: C F G C
chords: C7 D7 G7 C
\`\`\`

**Tokens:** \`A-G\` root (case=dynamics), optional \`7\` suffix, \`/\`=next bar

**Chord quality:** Inferred from scale degree
- In C Major: C=major, D=minor, E=minor, F=major, G=major, A=minor, B=diminished

## Examples

### Quarter note drums
\`\`\`
kick: X x X x
snare: . X . X
hihat: x x x x
\`\`\`

### 16th note hihat pattern
\`\`\`
kick: X . X .
snare: . X . X
hihat: xXxXxXxXxXxXxXx^
\`\`\`

### Bass line
\`\`\`
bass: C E G C / C D E F
\`\`\`

### Melody with dynamics
\`\`\`
melody: C d e F / G a b C
\`\`\`

### Sustained chord progression
\`\`\`
chords: C - - - / F - - - / G - - - / C - - - 
\`\`\`

### Rhythmic chord progression
\`\`\`
chords: C C C C / F F F F / G G G G / C C C - 
\`\`\`

### Multi-bar patterns
\`\`\`
kick: X . x . / X . x . / X . x . / X . x . 
bass: C - / E - / G - / C - - - 
melody: E G A / A G E / C E G / G E C - 
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
