// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Build out an empty scene with clips, then launch it
 */

import { type EvalScenario } from "../../types.ts";

export const fillAndPlayScene: EvalScenario = {
  id: "fill-and-play-scene",
  description: "Populate a scene with clips across tracks and launch it",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "In an empty scene, create a simple 1-bar idea: a four-on-the-floor kick on the Drums track and a root-note bass on the Bass track",
    "Launch that scene",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 6 },
    { type: "tool_called", tool: "ppal-playback", turn: 2, score: 4 },
    {
      type: "response_contains",
      pattern: /kick|bass|drum/i,
      turn: 1,
      score: 2,
    },
    {
      type: "response_contains",
      pattern: /launch|play|scene/i,
      turn: 2,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a kick-drum clip on the Drums track and a bass clip on the Bass track in the SAME scene
2. Made the kick a four-on-the-floor pattern (a hit on each beat)
3. Made the bass play root notes
4. Launched that scene so both clips play together`,
      score: 12,
    },
  ],
};
