// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create a rack and work with its macro controls
 */

import { type EvalScenario } from "../../types.ts";

export const rackWithMacros: EvalScenario = {
  id: "rack-with-macros",
  description: "Create an effect rack and inspect/adjust its macros",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Add an Audio Effect Rack with a Reverb and a Delay inside it on the Lead track",
    "Tell me what macro controls the rack exposes, then turn the first macro up to about 75%",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-device", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-read-device", turn: 2, score: 3 },
    { type: "tool_called", tool: "ppal-update-device", turn: 2, score: 4 },
    { type: "response_contains", pattern: /macro/i, turn: 2, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created an Audio Effect Rack containing a Reverb and a Delay on the Lead track
2. Read and reported the rack's macro controls accurately
3. Set the first macro to roughly 75%
4. Demonstrated understanding of rack macros vs individual device parameters`,
      score: 12,
    },
  ],
};
