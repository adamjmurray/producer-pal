// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create an Audio Effect Rack and place an effect inside it
 */

import { type EvalScenario } from "../../types.ts";

export const groupIntoAudioRack: EvalScenario = {
  id: "group-into-audio-rack",
  description: "Add an Audio Effect Rack and nest an effect in its chain",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Bass track, add an Audio Effect Rack, then put a Reverb inside the rack's chain",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-device", turn: 1, score: 6 },
    {
      type: "response_contains",
      pattern: /rack|reverb|chain/i,
      turn: 1,
      score: 3,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Added an Audio Effect Rack to the Bass track
2. Placed a Reverb device INSIDE the rack's chain (nested), not as a sibling next to the rack
3. Understood the rack/chain nesting (used a path into the rack's chain)
4. Confirmed the nested structure`,
      score: 12,
    },
  ],
};
