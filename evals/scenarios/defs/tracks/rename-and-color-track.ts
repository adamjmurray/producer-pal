// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Rename and recolor a track
 */

import { type EvalScenario } from "../../types.ts";

export const renameAndColorTrack: EvalScenario = {
  id: "rename-and-color-track",
  description: "Rename and recolor a track",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Rename the Bass track to 'Sub Bass' and make it blue",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-update-track", turn: 1, score: 5 },
    { type: "response_contains", pattern: /sub bass/i, turn: 1, score: 2 },
    { type: "response_contains", pattern: /blue/i, turn: 1, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Renamed the Bass track to 'Sub Bass'
2. Changed its color to blue
3. Confirmed`,
      score: 10,
    },
  ],
};
