// src/notation/barbeat/barbeat-description.js
export const BarBeatDescription = `<barbeat-notation>
bar|beat is a precise, stateful music notation format for MIDI sequencing.

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

- **Velocity (\`v<0-127>\` or \`v<min>-<max>\`)**
  - Sets velocity for following notes until changed
  - Single value: \`v100\` (fixed velocity)
  - Range: \`v80-120\` or \`v120-80\` (random velocity between min and max, auto-ordered)
  - **⚠️ SPECIAL: \`v0\` = DELETE NOTES** (ppal-update-clip only, requires clearExistingNotes: false)
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

## Musical Density Guidelines

Professional arrangements prioritize clarity and impact:
- **Space is musical**: Silence between notes often matters more than the notes themselves
- **Context matters**: A "sparse" drum pattern might have 50+ notes, while a "dense" bass line might have only 20
- **Build through dynamics**: Use velocity (v50 to v120) to create intensity rather than adding more notes
- **Rhythmic evolution**: Progress from long notes to shorter subdivisions (whole to half to quarter to eighth)

"Epic" or "dramatic" typically achieves impact through:
- Wide dynamic range rather than continuous fortissimo
- Rhythmic contrast between sections
- Strategic moments of space and silence
- Each instrument having room to breathe

## Tool-Specific Behavior

### v0 Note Deletion (ppal-update-clip only)

When using \`ppal-update-clip\` with \`clearExistingNotes: false\`, notes with \`v0\` velocity delete existing notes at the exact same bar|beat position and pitch:

\`\`\`
v0 2|1.5 Gb1  // Deletes hi-hat at bar 2, beat 1.5
\`\`\`

**Requirements for successful deletion:**
- Exact timing match: \`3|2.5\` will not delete a note at \`3|2.6\`
- Exact pitch match: \`Gb1\` will not delete \`F#1\` (even though they're enharmonic)
- Must use \`clearExistingNotes: false\`

**Tool differences:**
- \`ppal-create-clip\`: v0 notes are filtered out (not added to the clip)
- \`ppal-update-clip\`: v0 notes become deletion requests when \`clearExistingNotes: false\`

### ⚠️ CRITICAL: Read-First Workflow

**ALWAYS read the clip first** to get exact positions - guessing will fail!

1. **Read**: \`ppal-read-clip\` to identify exact positions and pitches
2. **Delete**: \`ppal-update-clip\` with \`clearExistingNotes: false\` and \`v0\` notes  
3. **Verify**: \`ppal-read-clip\` again to confirm changes

### Common Deletion Examples

**Remove downbeats from 16th note hi-hats:**
\`\`\`
// Before: 1|1 Gb1 1|1.25 Gb1 1|1.5 Gb1 1|1.75 Gb1 1|2 Gb1 1|2.25 Gb1 1|2.5 Gb1 1|2.75 Gb1
// Delete: v0 1|1 Gb1 1|2 Gb1
// After:  1|1.25 Gb1 1|1.5 Gb1 1|1.75 Gb1 1|2.25 Gb1 1|2.5 Gb1 1|2.75 Gb1
\`\`\`

**Delete specific chord notes:**
\`\`\`
// Before: 1|1 C3 E3 G3 B3
// Delete: v0 1|1 E3 B3
// After:  1|1 C3 G3
\`\`\`
</barbeat-notation>`;
