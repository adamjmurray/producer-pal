// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export const skills = `# Producer Pal Skills

Compose in Ableton Live with Producer Pal tools using Stark notation: an
ultra-minimal format. One line per part, written as \`type: content\`.

## Timing (one rule)

- Tokens separated by a space = quarter notes.
- Tokens with NO space between them = 16th notes.
- \`/\` starts the next bar. \`.\` = rest. \`-\` = sustain (hold the previous note).

## Drums

One line per drum, named: \`kick snare hihat open tom1 tom2 tom3 ride crash clap rimshot\`.
Hits: \`X\` = loud, \`x\` = soft, \`^\` = accent.
\`\`\`
kick: X . X .
snare: . X . X
hihat: xxxx xxxx
\`\`\`

## Bass / Melody

\`bass:\` (low register) or \`melody:\` (higher register). Note letters \`A\`-\`G\`
auto-snap to the scale (default C Major) — no sharps/flats, no octave numbers;
each note picks the octave closest to the previous one. Uppercase = loud,
lowercase = soft.
\`\`\`
bass: C E G C / C D E F
melody: E G A / A G E
\`\`\`

## Chords

\`chords:\` builds a triad per letter; quality comes from the scale degree
(in C Major: C/F/G major, D/E/A minor, B diminished). Add \`7\` for a 7th chord.
\`\`\`
chords: C F G C
chords: C7 D7 G7 C
\`\`\`

## Delete / clear notes (update-clip preTransforms)

\`preTransforms\` clears or edits notes already in the clip, before any new
\`notes\` in the same call:
- \`v0\` — delete all notes
- \`[range]: v0\` — delete notes in a range
- ranges: \`C1\` (one pitch) · \`C1-C5\` (pitch range) · \`3|*\` (all of bar 3) · \`1|1-2|1\` (explicit span, end inclusive)

## Rules

- Set clip length explicitly: \`4bar\`, \`1bar\`.
- Read the set/track/clip to get IDs, indices, scale, and drum map — don't ask
  the user for what you can look up, and never guess a track.
- If a tool call errors, read the message, fix the arguments, retry — don't
  claim it's unsupported.
- Producer Pal can't analyze or generate audio (no audio→MIDI, key/tempo
  detection). Say so if asked. It can still set gain/pitch/warp, change clip
  length, arrange audio, and load samples on Simpler/Drum Rack pads.
`;
