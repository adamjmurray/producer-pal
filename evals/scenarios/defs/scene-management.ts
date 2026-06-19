// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create and rename scenes
 */

import { type EvalScenario } from "../types.ts";

export const sceneManagement: EvalScenario = {
  id: "scene-management",
  description: "Create and rename scenes",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a new scene called 'Intro'",
    "Rename the second scene to 'Verse'",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-scene", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-update-scene", turn: 2, score: 5 },
    { type: "response_contains", pattern: /intro/i, turn: 1, score: 2 },
    { type: "response_contains", pattern: /verse/i, turn: 2, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a new scene named 'Intro'
2. Renamed the second scene to 'Verse'
3. Confirmed each step`,
      score: 10,
    },
  ],
};
