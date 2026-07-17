// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Name and color the first few scenes
 */

import { type EvalScenario } from "../../types.ts";

export const colorAndNameScenes: EvalScenario = {
  id: "color-and-name-scenes",
  description: "Rename and color the first three scenes",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Rename the first three scenes to A, B, and C, and give each a different color",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-update-scene", turn: 1, score: 6 },
    {
      type: "response_contains",
      pattern: /\ba\b|\bb\b|\bc\b|color/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Renamed the first three scenes to A, B, and C respectively (in order)
2. Gave each of the three scenes a color
3. Used three distinct colors rather than the same one
4. Targeted the first three scenes specifically`,
      score: 10,
    },
  ],
};
