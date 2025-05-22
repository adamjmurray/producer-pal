// src/notation/barbeat/barbeat-description.js
export const BarBeatDescription = `<barbeat-specification>
BarBeat is a precise, stateful music notation format for MIDI sequencing.

## Core Syntax

\`[bar:beat] [v<velocity>] [t<duration>] note [note ...]\`

### Components:

- **Start Time (\`bar:beat\`)** Absolute timestamp for event start.
  - \`bar\` - 1-based bar number (integer)
  - \`beat\` - 1-based beat number within bar (float for sub-beat precision)
  - Can be standalone to set default time for following notes
  - Persists until explicitly changed

- **Velocity (\`v<0-127>\`)**
  - Sets velocity for following notes until changed
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
- **Time**: Set with \`bar:beat\`, applies to following notes until changed
- **Velocity**: Set with \`v<value>\`, applies to following notes until changed  
- **Duration**: Set with \`t<value>\`, applies to following notes until changed

## Examples

\`\`\`
// C major triad at bar 1, beat 1
1:1 C3 E3 G3

// Simple melody with state changes
1:1 v100 t1.0 C3
1:2 D3
1:3 E3
2:1 v80 t2.0 G3

// Sub-beat timing
1:1 v100 t0.25 C3
1:1.5 D3
1:2.25 E3

// Drum pattern
1:1 v100 t0.25 C1 Gb1
1:1.5 v60 Gb1
1:2 v90 D1
\`\`\`
</barbeat-specification>`;
