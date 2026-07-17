// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Write a diatonic chord progression in the set's key
 */

import { type EvalScenario } from "../../types.ts";

export const chordProgressionInKey: EvalScenario = {
  id: "chord-progression-in-key",
  description:
    "Create a diatonic ii-V-i progression in the set's key (A minor)",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Chords track, write a 4-bar ii-V-i chord progression in the key of this set, one chord per bar, with the final bar resolving home",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },
    {
      type: "response_contains",
      pattern: /chord|minor|progression|ii|v|i\b/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `The set is in A minor. Evaluate if the assistant:
1. Created a 4-bar chord clip on the Chords track
2. Used a ii-V-i in A minor — i.e. Bdim (or Bm7b5), E (or E7), then resolving to Am
3. Used actual chords (multiple simultaneous notes per bar), not single notes
4. Stayed diatonic/in key and resolved to the tonic (A minor) at the end
Award partial credit if the progression is musically valid in A minor but not exactly ii-V-i.`,
      score: 14,
    },
  ],
};
