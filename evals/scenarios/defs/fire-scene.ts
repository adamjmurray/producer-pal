// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Launch a scene
 */

import { type EvalScenario } from "../types.ts";

export const fireScene: EvalScenario = {
  id: "fire-scene",
  description: "Launch a scene",
  liveSet: "basic-midi-4-track",

  messages: ["Connect to Ableton Live", "Launch the first scene"],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-playback", turn: 1, score: 5 },
    {
      type: "response_contains",
      pattern: /scen|launch|play/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Launched the first scene (scene index 0)
2. Confirmed playback started`,
      score: 10,
    },
  ],
};
