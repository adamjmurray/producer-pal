// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Generate a 4-bar melody in A minor
 */

import { type EvalScenario } from "../types.ts";

export const midiMelody: EvalScenario = {
  id: "midi-melody",
  description: "Generate a 4-bar melody in A minor",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Write a catchy 4-bar melody in A minor on a new MIDI track",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: "any", score: 5 },
    {
      type: "response_contains",
      pattern: /melody|a minor/i,
      turn: "any",
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate the assistant's melody:
1. Created a 4-bar MIDI clip
2. The notes fit A minor
3. The melody is musically reasonable (sensible contour and rhythm, not random)
4. Confirmed what it made`,
      score: 10,
    },
  ],
};
