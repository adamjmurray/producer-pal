// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Color-code multiple tracks by their musical role
 */

import { type EvalScenario } from "../../types.ts";

export const colorTracksByRole: EvalScenario = {
  id: "color-tracks-by-role",
  description: "Apply distinct colors to several tracks in one request",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Color-code the tracks so I can read the set at a glance: make Drums red, Bass blue, Chords green, and Lead yellow",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-update-track", turn: 1, score: 6 },
    {
      type: "response_contains",
      pattern: /color|red|blue|green|yellow/i,
      turn: 1,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Set a color on all four named tracks (Drums, Bass, Chords, Lead)
2. Mapped each track to the requested color (Drums=red, Bass=blue, Chords=green, Lead=yellow)
3. Handled the multi-track update efficiently rather than missing tracks`,
      score: 10,
    },
  ],
};
