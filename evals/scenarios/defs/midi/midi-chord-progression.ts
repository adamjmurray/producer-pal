// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Generate a chord progression in A minor
 */

import { type EvalScenario } from "../../types.ts";

export const midiChordProgression: EvalScenario = {
  id: "midi-chord-progression",
  description: "Generate a chord progression in A minor",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a 4-bar chord progression in A minor on the Chords track, one chord per bar",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: "any", score: 5 },
    {
      type: "response_contains",
      pattern: /chord|a minor/i,
      turn: "any",
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate the assistant's chords:
1. Created a 4-bar clip on the Chords track
2. It contains four chords (one per bar)
3. The chords fit A minor and form a sensible progression
4. Confirmed`,
      score: 10,
    },
  ],
};
