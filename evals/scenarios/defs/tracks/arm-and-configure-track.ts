// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create a MIDI track and configure it (name, color, arm)
 */

import { type EvalScenario } from "../../types.ts";

export const armAndConfigureTrack: EvalScenario = {
  id: "arm-and-configure-track",
  description: "Create, name, color, and arm a new MIDI track in one go",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Add a new MIDI track called 'Pad', color it purple, and arm it for recording",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-track", turn: 1, score: 5 },
    {
      type: "response_contains",
      pattern: /pad|purple|arm/i,
      turn: 1,
      score: 3,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a new MIDI track named "Pad"
2. Set its color to purple
3. Armed it for recording
4. Accomplished all three properties on the new track (not on an existing one)`,
      score: 10,
    },
  ],
};
