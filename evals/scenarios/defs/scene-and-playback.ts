// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create scene with tempo, play and stop
 */

import { type EvalScenario } from "../types.ts";

export const sceneAndPlayback: EvalScenario = {
  id: "scene-and-playback",
  description: "Create scene with tempo, play and stop",
  kind: "regression",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a scene called 'Intro' with tempo 100",
    "Play that scene",
    "Stop playback",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Scene creation
    { type: "tool_called", tool: "ppal-create-scene", turn: 1 },

    // Turn 2: Play scene
    { type: "tool_called", tool: "ppal-playback", turn: 2 },

    // Turn 3: Stop playback
    { type: "tool_called", tool: "ppal-playback", turn: 3 },

    { type: "response_contains", pattern: /intro/i, turn: 1 },
    { type: "response_contains", pattern: /play/i, turn: 2 },
    { type: "response_contains", pattern: /stop/i, turn: 3 },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 80_000,
    },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a scene named "Intro" with tempo 100 BPM
2. Played that scene
3. Stopped playback
4. Confirmed each step was completed`,
    },
  ],
};
