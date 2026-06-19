// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create a track and load an instrument
 */

import { type EvalScenario } from "../../types.ts";

export const loadInstrument: EvalScenario = {
  id: "load-instrument",
  description: "Create a track and load an instrument",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a new MIDI track and load an Operator synth on it",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-track", turn: "any", score: 4 },
    { type: "tool_called", tool: "ppal-create-device", turn: "any", score: 5 },
    { type: "response_contains", pattern: /operator/i, turn: "any", score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a new MIDI track
2. Loaded an Operator instrument on it
3. Confirmed`,
      score: 10,
    },
  ],
};
