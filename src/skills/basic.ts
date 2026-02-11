// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

export const skills = `# Producer Pal Skills

## Time in Ableton Live

- **Positions**: bar|beat (1-indexed). Examples: 1|1 = first beat, 2|3.5 = bar 2 beat 3.5
- **Durations**: beats (4, 2.5, 3/4) or bar:beat (4:0 = 4 bars)

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
C1 1|1,3              # kick on beats 1 and 3
D1 1|2,4              # snare on beats 2 and 4
Gb1 1|1.5,2.5,3.5,4.5 # hats on off-beats
C1 2|1,2,3,4          # kick on every beat in bar 2
D1 2|2,4              # snare on beats 2 and 4 in bar 2
\`\`\`

## Rules
- Use only the notation features shown in the examples above
- Set clip lengths explicitly (e.g., 4:0 for 4 bars)
- To remove notes from a clip, delete the clip and create a new one
- Always call ppal-read-live-set before creating or updating anything
- If the user references a track, get its trackIndex and id - never guess
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
      "* Summarize the Live Set",
      ...(memory?.content
        ? [
            `* Summarize the project notes${
              memory.writable
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
