// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create track, add device, update properties
 */

import type { EvalScenario } from "../types.ts";

export const trackAndDeviceWorkflow: EvalScenario = {
  id: "track-and-device-workflow",
  description: "Create track, add device, update properties",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a MIDI track called 'Synth Lead'",
    "Add a Wavetable instrument to it",
    "Mute that track and set its color to purple",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Track creation
    { type: "tool_called", tool: "ppal-create-track", turn: 1 },

    // Turn 2: Device creation
    { type: "tool_called", tool: "ppal-create-device", turn: 2 },

    // Turn 3: Track property updates
    { type: "tool_called", tool: "ppal-update-track", turn: 3 },

    // Verify response mentions the track
    { type: "response_contains", pattern: /synth lead/i, turn: 1 },

    // Verify response mentions Wavetable
    { type: "response_contains", pattern: /wavetable/i, turn: 2 },

    // Verify response mentions mute or purple
    { type: "response_contains", pattern: /mute|purple/i, turn: 3 },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a MIDI track named "Synth Lead"
2. Added a Wavetable instrument
3. Muted the track
4. Changed the track color to purple`,
      minScore: 4,
    },
  ],
};
