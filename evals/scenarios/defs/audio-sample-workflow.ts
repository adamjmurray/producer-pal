// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Browse samples, create audio clip, modify audio properties
 */

import { resolve } from "node:path";
import { type EvalScenario } from "../types.ts";

const SAMPLE_FOLDER = resolve(
  import.meta.dirname,
  "../../../live-sets/samples",
);

export const audioSampleWorkflow: EvalScenario = {
  id: "audio-sample-workflow",
  description: "Browse samples, create audio clip, modify audio properties",
  liveSet: "basic-midi-4-track",

  config: {
    sampleFolder: SAMPLE_FOLDER,
  },

  messages: [
    "Connect to Ableton Live",
    "Show me available drum samples",
    "Create an audio clip using the kick sample on the Drums track",
    "Pitch shift it up 5 semitones and loop it",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Sample browsing
    { type: "tool_called", tool: "ppal-context", turn: 1 },

    // Turn 2: Audio clip creation
    { type: "tool_called", tool: "ppal-create-clip", turn: 2 },

    // Turn 3: Audio property updates
    { type: "tool_called", tool: "ppal-update-clip", turn: 3 },

    { type: "response_contains", pattern: /kick/i, turn: 1 },
    { type: "response_contains", pattern: /audio|clip/i, turn: 2 },
    {
      type: "response_contains",
      pattern: /pitch|semitone/i,
      turn: 3,
    },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 80_000,
    },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Listed available drum samples including kick
2. Created an audio clip using the kick sample
3. Applied pitch shift of 5 semitones and enabled looping
4. Confirmed each step was completed`,
    },
  ],
};
