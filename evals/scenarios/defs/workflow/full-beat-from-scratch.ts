// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Build a complete multi-track loop from a single prompt
 */

import { type EvalScenario } from "../../types.ts";

export const fullBeatFromScratch: EvalScenario = {
  id: "full-beat-from-scratch",
  description: "Build a cohesive 4-bar drums+bass+chords loop in one request",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Build me a complete 4-bar lo-fi hip-hop loop in the same scene: a laid-back drum beat on the Drums track, a bassline on the Bass track, and a chord progression on the Chords track. Keep everything in the key of this set and make the parts work together.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    {
      type: "tool_called",
      tool: "ppal-create-clip",
      turn: 1,
      score: 6,
      count: { min: 3 },
    },
    {
      type: "response_contains",
      pattern: /drum|bass|chord|loop/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `The set is in A minor at 120 BPM. Evaluate if the assistant built a cohesive 4-bar loop where:
1. There are three new clips in the SAME scene — drums (Drums track), bass (Bass track), and chords (Chords track)
2. The chord progression is diatonic in A minor and the bass follows the chord roots
3. The drum beat is a coherent laid-back/lo-fi groove (kick, snare, hats) — not random
4. All three parts are the same length (4 bars) and harmonically consistent so they'd play well together
This is a hard, multi-part task — award partial credit per part that is done well, and reward overall musical cohesion.`,
      score: 16,
    },
  ],
};
