// src/notation/barbeat/barbeat-description.js
export const BarBeatDescription = `<barbeat-notation>
BarBeat is a precise, stateful music notation format for MIDI sequencing.

## Core Syntax

\`[bar|beat] [v<velocity>] [t<duration>] [p<probability>] note [note ...]\`

### Components:

- **Start Time (\`bar|beat\`)** Timestamp for event start, relative to an Ableton Live clip's start (not the absolute time in the arrangement).
  - \`bar\` - 1-based bar number (integer)
  - \`beat\` - 1-based beat number within bar (float for sub-beat precision). The beat depends on the time signature denominator (e.g. in 6/8, an 8th note gets the beat).
  - \`1|1\` - the start of a clip
  - Can be standalone to set default time for following notes
  - Persists until explicitly changed

- **Probability (\`p<0.0-1.0>\`)**
  - Sets note probability for following notes until changed
  - 1.0 = note always plays, 0.0 = note never plays
  - Default: 1.0

- **Velocity (\`v<1-127>\` or \`v<min>-<max>\`)**
  - Sets velocity for following notes until changed
  - Single value: \`v100\` (fixed velocity)
  - Range: \`v80-120\` or \`v120-80\` (random velocity between min and max, auto-ordered)
  - Default: 100

- **Duration (\`t<float>\`)**
  - Sets duration in beats for following notes until changed
  - Default: 1.0

- **Note (\`C4\`, \`Eb2\`, \`F#3\`, etc.)**
  - Standard pitch notation with octave
  - Valid pitch classes: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#, Bb, B
  - MIDI pitch range: 0-127

### State Management

All components are stateful:
- **Time**: Set with \`bar|beat\`, applies to following notes until changed
- **Probability**: Set with \`p<value>\`, applies to following notes until changed  
- **Velocity**: Set with \`v<value>\` or \`v<min>-<max>\`, applies to following notes until changed
- **Duration**: Set with \`t<value>\`, applies to following notes until changed

## Examples

C major triad at bar 1, beat 1 (the first beat ):
\`\`\`
1|1 C3 E3 G3
\`\`\`

Simple melody with state changes:
\`\`\`
1|1 v100 t1.0 C3
1|2 D3
1|3 E3
2|1 v80 t2.0 G3
\`\`\`

Sub-beat timing:
\`\`\`
1|1 v100 t0.25 C3
1|1.5 D3
1|2.25 E3
\`\`\`

Drum pattern with probability and velocity variation
\`\`\`
1|1 v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1
1|1.5 p0.6 Gb1
1|2 v90 p1.0 D1
v100 p0.9 Gb1
\`\`\`
</barbeat-notation>`;
