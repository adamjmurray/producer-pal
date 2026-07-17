// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Load an instrument and stack audio effects after it
 */

import { type EvalScenario } from "../../types.ts";

export const instrumentPlusEffects: EvalScenario = {
  id: "instrument-plus-effects",
  description: "Add an instrument to a MIDI track plus effects after it",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a new MIDI track called 'Keys', load an instrument on it (a piano or electric piano), then add a Chorus and a Reverb after the instrument",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-track", turn: 1, score: 4 },
    { type: "tool_called", tool: "ppal-create-device", turn: 1, score: 5 },
    {
      type: "response_contains",
      pattern: /keys|piano|instrument|chorus|reverb/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a new MIDI track named "Keys"
2. Loaded an instrument (piano/electric piano or similar) on it
3. Added a Chorus and a Reverb as audio effects AFTER the instrument in the chain
4. Got the signal-flow order right (instrument first, then effects)`,
      score: 12,
    },
  ],
};
