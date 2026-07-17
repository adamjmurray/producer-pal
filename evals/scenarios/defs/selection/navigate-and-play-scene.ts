// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Navigate to a scene and launch it (selection + playback)
 */

import { type EvalScenario } from "../../types.ts";

export const navigateAndPlayScene: EvalScenario = {
  id: "navigate-and-play-scene",
  description: "Select a scene and launch it, then stop playback",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Select the second scene and launch it",
    "Stop playback",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-playback", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-playback", turn: 2, score: 4 },
    {
      type: "response_contains",
      pattern: /scene|launch|play/i,
      turn: 1,
      score: 2,
    },
    { type: "response_contains", pattern: /stop/i, turn: 2, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Targeted the second scene (scene index 1) specifically
2. Launched/played that scene
3. Stopped playback when asked
4. Did not fire the wrong scene or leave playback running`,
      score: 10,
    },
  ],
};
