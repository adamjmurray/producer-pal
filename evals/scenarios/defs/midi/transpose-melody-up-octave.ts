// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create a melody, then transpose it up an octave
 */

import { type EvalScenario } from "../../types.ts";

export const transposeMelodyUpOctave: EvalScenario = {
  id: "transpose-melody-up-octave",
  description: "Create a melody and transpose the existing clip up an octave",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Lead track, write a simple 2-bar melody in A minor",
    "That's too low. Move the whole melody up one octave, keeping the same notes and rhythm.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-update-clip", turn: 2, score: 5 },
    {
      type: "response_contains",
      pattern: /octave|up|transpos|higher/i,
      turn: 2,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 2-bar melody in A minor on the Lead track
2. Transposed the EXISTING melody up exactly one octave (+12 semitones on every note)
3. Preserved the same pitch contour and rhythm (same note names, just an octave higher)
4. Edited the existing clip rather than writing a brand-new unrelated melody`,
      score: 12,
    },
  ],
};
