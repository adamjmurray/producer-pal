// src/notation/bar-beat-script/bbs-description.js
export const BAR_BEAT_SCRIPT_DESCRIPTION = `<BarBeatScript-Specification>
BarBeatScript is a precise, absolute-time-based music notation format for MIDI sequencing.

## Core Syntax

\`\`\`
bar.beat[.unit]:note[modifiers] [, ...]
\`\`\`

### Components:

- **Start Time (\`bar.beat.unit\`)** Absolute timestamp for event start.
  - \`bar\` - 1-based bar number (integer)
  - \`beat\` - 1-based beat number within bar (integer) 
  - \`unit\` - Optional. Tick offset within beat (0-479 for 480 PPQN). Defaults to \`0\` if omitted.

- **Note (\`C4\`, \`F#3\`, etc.)**
  - Standard pitch notation with octave
  - Valid MIDI pitch range: 0-127

- **Modifiers (optional)**
  - \`v<0-127>\` — Velocity (default: 70)
  - \`t<float>\` — Duration in beats (default: 1.0)

- **Events**
  - Multiple notes can be specified at a single start time, separated by whitespace after the colon
  - Events are comma-separated

## Examples

\`\`\`
// C major triad at bar 1, beat 1
1.1.0:C3 E3 G3

// Simple melody across bars  
1.1.0:C3t1, 1.2.0:D3t1, 1.3.0:E3t1, 1.4.0:F3t1, 2.1.0:G3t2,

// Sixteenth notes (120 units apart in 4/4)
1.1.0:C3t0.25, 1.1.120:D3t0.25, 1.1.240:E3t0.25, 1.1.360:F3t0.25,

// Velocity variations
1.1.0:C3v100, 1.2.0:C3v80, 1.3.0:C3v60, 1.4.0:C3v40,
\`\`\`
</BarBeatScript-Specification>`;
