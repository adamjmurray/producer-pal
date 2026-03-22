// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Update Live Set global properties and delete a track
 */

import { type EvalScenario } from "../types.ts";

export const updateLiveSet: EvalScenario = {
  id: "update-live-set",
  description: "Update Live Set global properties and delete a track",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Set the tempo to 128 BPM and the time signature to 6/8",
    "Delete the last track",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },

    // Turn 1: Live set property updates
    { type: "tool_called", tool: "ppal-update-live-set", turn: 1, score: 5 },
    { type: "response_contains", pattern: /128/, turn: 1, score: 2 },
    { type: "response_contains", pattern: /6\/8/, turn: 1, score: 2 },

    // Turn 2: Delete track
    { type: "tool_called", tool: "ppal-delete", turn: 2, score: 5 },
    { type: "response_contains", pattern: /delet/i, turn: 2, score: 2 },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 60_000,
      upperLimit: 100_000,
      score: 5,
    },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Set the tempo to 128 BPM
2. Set the time signature to 6/8
3. Deleted the last track
4. Confirmed each step was completed`,
      score: 10,
    },
  ],
};
