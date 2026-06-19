// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Delete a track
 */

import { type EvalScenario } from "../../types.ts";

export const deleteTrack: EvalScenario = {
  id: "delete-track",
  description: "Delete a track",
  liveSet: "basic-midi-4-track",

  messages: ["Connect to Ableton Live", "Delete the Chords track"],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-delete", turn: 1, score: 5 },
    { type: "response_contains", pattern: /delet|remov/i, turn: 1, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Deleted the Chords track
2. Confirmed the deletion`,
      score: 10,
    },
  ],
};
