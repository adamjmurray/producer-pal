// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Add a device and adjust a parameter
 */

import { type EvalScenario } from "../../types.ts";

export const addAndConfigureDevice: EvalScenario = {
  id: "add-and-configure-device",
  description: "Add a device and adjust a parameter",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Add a Reverb to the Bass track",
    "Set its dry/wet to about 40%",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-device", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-update-device", turn: 2, score: 5 },
    { type: "response_contains", pattern: /reverb/i, turn: 1, score: 2 },
    { type: "response_contains", pattern: /dry|wet|40/i, turn: 2, score: 2 },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Added a Reverb device to the Bass track
2. Adjusted its dry/wet parameter toward 40%
3. Confirmed`,
      score: 10,
    },
  ],
};
