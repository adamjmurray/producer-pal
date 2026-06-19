// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Start and stop playback
 */

import { type EvalScenario } from "../types.ts";

export const playbackControl: EvalScenario = {
  id: "playback-control",
  description: "Start and stop playback",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Start playing the arrangement",
    "Now stop playback",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-playback", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-playback", turn: 2, score: 5 },
    { type: "response_contains", pattern: /play|start/i, turn: 1, score: 2 },
    { type: "response_contains", pattern: /stop/i, turn: 2, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Started playback
2. Stopped playback
3. Confirmed each action`,
      score: 10,
    },
  ],
};
