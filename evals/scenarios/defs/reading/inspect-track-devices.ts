// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Inspect the devices on a track
 */

import { type EvalScenario } from "../../types.ts";

export const inspectTrackDevices: EvalScenario = {
  id: "inspect-track-devices",
  description: "Inspect the devices on a track",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "What devices and effects are on the Drums track?",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-read-track", turn: "any", score: 5 },
    {
      type: "response_contains",
      pattern: /compressor|eq|filter|device|effect/i,
      turn: "any",
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Looked up the Drums track's devices
2. Listed the effects/devices on it
3. Was accurate`,
      score: 10,
    },
  ],
};
