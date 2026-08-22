// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create track, add device, update properties, route a send
 */

import { type EvalScenario } from "../../types.ts";

export const trackAndDeviceWorkflow: EvalScenario = {
  id: "track-and-device-workflow",
  description: "Create track, add device, update properties, route a send",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The checks below pin the outcome. The judge only adds commentary they
  // can't anticipate — hallucinations, misleading prose, extra steps.
  judgeAdvisory: true,

  messages: [
    "Connect to Ableton Live",
    "Create a MIDI track called 'Synth Lead'",
    "Add a Wavetable instrument to it",
    "Mute that track and set its color to purple",
    "Set the filter cutoff to 50%",
    "Create a return track with a Reverb on it, then send the Synth Lead track to that return at -12 dB",
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

    // Turn 4: Device parameter update
    { type: "tool_called", tool: "ppal-update-device", turn: 4 },
    {
      type: "response_contains",
      pattern: /filter|cutoff/i,
      turn: 4,
    },

    // Turn 5: Return track + send routing
    { type: "tool_called", tool: "ppal-create-track", turn: 5 },
    { type: "tool_called", tool: "ppal-update-track", turn: 5 },
    {
      type: "response_contains",
      pattern: /send|return|reverb/i,
      turn: 5,
    },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a MIDI track named "Synth Lead"
2. Added a Wavetable instrument
3. Muted the track
4. Changed the track color to purple
5. Adjusted the filter cutoff parameter on the device
6. Created a return track (with a Reverb) and set the Synth Lead track's send to that return to -12 dB`,
    },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 140_000,
    },
  ],
};
