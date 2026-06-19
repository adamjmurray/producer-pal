// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Set tempo and time signature
 */

import { type EvalScenario } from "../../types.ts";

export const setTempoAndTimeSignature: EvalScenario = {
  id: "set-tempo-and-time-signature",
  description: "Set tempo and time signature",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Set the tempo to 140 BPM",
    "Change the time signature to 3/4",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-update-live-set", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-update-live-set", turn: 2, score: 5 },
    { type: "response_contains", pattern: /140/, turn: 1, score: 2 },
    { type: "response_contains", pattern: /3\/4/, turn: 2, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Set the tempo to 140 BPM
2. Changed the time signature to 3/4
3. Confirmed each change`,
      score: 10,
    },
  ],
};
