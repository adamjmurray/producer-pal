// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Write a bassline that follows a chord progression's roots
 */

import { type EvalScenario } from "../../types.ts";

export const basslineFollowsRoots: EvalScenario = {
  id: "bassline-follows-roots",
  description: "Create a bassline that follows the roots of a progression",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Bass track, write a 4-bar bassline for this progression: Am, F, C, G — one bar each. The bass should land on the root of each chord on the downbeat, then add a little rhythmic movement that stays in key.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },
    {
      type: "response_contains",
      pattern: /bass|root|a\b|f\b|c\b|g\b/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant created a 4-bar bass clip on the Bass track where:
1. The downbeat of each bar lands on the chord root in order: A, F, C, G
2. The notes are in a bass register (low octaves)
3. There is some rhythmic movement within bars (not a single whole note per bar)
4. The extra notes stay in key (A minor / C major) and don't clash
Award partial credit if roots are correct but movement/voicing is weak.`,
      score: 14,
    },
  ],
};
