// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Add an EQ to a track and use it to cut low frequencies
 */

import { type EvalScenario } from "../../types.ts";

export const addEqCutLows: EvalScenario = {
  id: "add-eq-cut-lows",
  description: "Add an EQ to the Lead track and high-pass out the low end",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Add an EQ Eight to the Lead track, then use it to roll off the low frequencies below about 200 Hz",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-device", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-update-device", turn: 1, score: 4 },
    {
      type: "response_contains",
      pattern: /eq|low|high.?pass|200|hz/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Added an EQ Eight device to the Lead track
2. Configured it to attenuate low frequencies (a high-pass / low-cut around 200 Hz)
3. Adjusted an actual device parameter rather than only describing what to do
4. Targeted the Lead track specifically`,
      score: 12,
    },
  ],
};
