// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Select a specific track and scene (view/selection state)
 */

import { type EvalScenario } from "../../types.ts";

export const selectTrackAndScene: EvalScenario = {
  id: "select-track-and-scene",
  description: "Select a track and scene to change Live's selection state",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Select the Bass track",
    "Now select the third scene",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-select", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-select", turn: 2, score: 5 },
    { type: "response_contains", pattern: /bass/i, turn: 1, score: 2 },
    { type: "response_contains", pattern: /scene|third|3/i, turn: 2, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Selected the Bass track (not a different track)
2. Selected the third scene (scene index 2)
3. Confirmed each selection without making unrelated changes`,
      score: 10,
    },
  ],
};
