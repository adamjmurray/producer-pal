// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Switch Live's main view to Arrangement and select a track
 */

import { type EvalScenario } from "../../types.ts";

export const switchToArrangementView: EvalScenario = {
  id: "switch-to-arrangement-view",
  description: "Switch to Arrangement view and focus a track",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Switch to the Arrangement view, then select the Drums track",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-select", turn: 1, score: 6 },
    {
      type: "response_contains",
      pattern: /arrangement/i,
      turn: 1,
      score: 2,
    },
    { type: "response_contains", pattern: /drums/i, turn: 1, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Switched the main view to Arrangement (not Session)
2. Selected the Drums track
3. Did both in a single coherent step and confirmed the result`,
      score: 10,
    },
  ],
};
