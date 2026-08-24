// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Browse samples, create audio clip, modify audio properties
 */

import { resolveSamplesPath } from "../../run-scenario-helpers.ts";
import { type EvalScenario } from "../../types.ts";

export const audioSampleWorkflow: EvalScenario = {
  id: "audio-sample-workflow",
  description: "Browse samples, create audio clip, modify audio properties",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The checks below pin the outcome. The judge only adds commentary they
  // can't anticipate — hallucinations, misleading prose, extra steps.
  judgeAdvisory: true,

  config: {
    sampleFolder: resolveSamplesPath("samples"),
  },

  messages: [
    "Connect to Ableton Live",
    "Show me available drum samples",
    // The kick lives in the drum rack on the MIDI "Drums" track. Audio clips
    // can't go on a MIDI track, so the intended workflow is: create a new audio
    // track (the set has none) and place the sample as an audio clip there.
    "Create an audio clip from that kick sample. The Drums track is MIDI, so make a new audio track for the clip.",
    "Pitch shift it up 5 semitones and loop it",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Sample browsing (ppal-library is the modern sample-search tool)
    { type: "tool_called", tool: "ppal-library", turn: 1 },

    // Turn 2: New audio track + audio clip with the sample
    { type: "tool_called", tool: "ppal-create-track", turn: 2 },
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
2. Created a new audio track (the set had only MIDI tracks) and placed the kick sample into an audio clip on that audio track — NOT on the MIDI Drums track
3. Applied pitch shift of 5 semitones and enabled looping on the audio clip
4. Confirmed each step was completed`,
    },
  ],
};
