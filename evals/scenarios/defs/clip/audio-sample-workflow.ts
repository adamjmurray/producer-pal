// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: Search the library, create audio clip, modify audio properties
 */

import { sampleBrowseAssertionHead } from "../helpers/sample-browse-setup.ts";
import { type EvalScenario } from "../../types.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

export const audioSampleWorkflow: EvalScenario = {
  id: "audio-sample-workflow",
  tags: ["clips"],
  description: "Search the library, create audio clip, modify audio properties",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The checks below pin the outcome. The judge only adds commentary they
  // can't anticipate — hallucinations, misleading prose, extra steps.
  judgeAdvisory: true,

  messages: [
    "Connect to Ableton Live",
    "Show me a few kick drum samples from the Live library",
    // Audio clips can't go on a MIDI track, so the intended workflow is: create
    // a new audio track (the set has none) and place the sample as an audio
    // clip there.
    "Create an audio clip from the first kick sample. The Drums track is MIDI, so make a new audio track for the clip.",
    "Pitch shift it up 5 semitones and loop it",
  ],

  assertions: [
    // Turns 0-2: connect, browse the samples, make the audio track
    ...sampleBrowseAssertionHead(),

    // Turn 2: the audio clip carrying the sample
    { type: "tool_called", tool: TOOLS.createClip, turn: 2 },

    // Turn 3: Audio property updates
    { type: "tool_called", tool: TOOLS.updateClip, turn: 3 },

    { type: "response_contains", pattern: /kick/i, turn: 1 },
    { type: "response_contains", pattern: /audio|clip/i, turn: 2 },
    {
      type: "response_contains",
      pattern: /pitch|semitone/i,
      turn: 3,
    },

    {
      type: "token_usage",
      maxTokens: 4_500,
    },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Listed kick drum samples from the library
2. Created a new audio track (the set had only MIDI tracks) and placed a listed kick sample into an audio clip on that audio track — NOT on the MIDI Drums track
3. Applied pitch shift of 5 semitones and enabled looping on the audio clip
4. Said in its replies that each step above was done`,
    },
  ],
};
