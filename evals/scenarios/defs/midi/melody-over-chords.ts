// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Write a melody that fits over a chord progression
 */

import { type EvalScenario } from "../../types.ts";

export const melodyOverChords: EvalScenario = {
  id: "melody-over-chords",
  description: "Create chords, then a melody that fits over them",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Chords track, make a 4-bar progression: Am, F, C, G (one chord per bar)",
    "Now on the Lead track, write a 4-bar melody that sits on top of that progression and sounds good over each chord",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 4 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 2, score: 5 },
    {
      type: "response_contains",
      pattern: /melod|lead|note/i,
      turn: 2,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 4-bar Am - F - C - G chord clip on the Chords track
2. Created a separate 4-bar single-note melody on the Lead track
3. Wrote a melody whose notes are largely consonant with each underlying chord (chord tones / in the C major / A minor scale), changing to fit the harmony as it moves Am->F->C->G
4. Produced an actual melodic line (varied pitches/rhythm), not a static or random one
Award partial credit for a melody that is in key but doesn't track the chords closely.`,
      score: 14,
    },
  ],
};
