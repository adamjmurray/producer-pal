// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Add a reverb and dial in specific parameter values
 */

import { type EvalScenario } from "../../types.ts";

export const tweakDeviceParameters: EvalScenario = {
  id: "tweak-device-parameters",
  description: "Add a reverb and set specific parameter values on it",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Add a Reverb to the Chords track, then set it to a roughly 50% dry/wet and a long decay time",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-device", turn: 1, score: 4 },
    { type: "tool_called", tool: "ppal-update-device", turn: 1, score: 5 },
    {
      type: "response_contains",
      pattern: /reverb|dry|wet|decay|50/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Added a Reverb to the Chords track
2. Adjusted real device parameters (read the device's parameters and set them by name/value)
3. Moved dry/wet toward ~50% and increased the decay/reverb time
4. Did not just claim values without calling an update`,
      score: 12,
    },
  ],
};
