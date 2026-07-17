// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create a drum groove with swing and velocity variation
 */

import { type EvalScenario } from "../../types.ts";

export const swingAndHumanizeDrums: EvalScenario = {
  id: "swing-and-humanize-drums",
  description: "Create a drum groove, then add swing and velocity feel",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Drums track, make a 2-bar boom-bap drum beat with kick, snare on 2 and 4, and steady hi-hats",
    "Give it a human feel: add some swing to the hi-hats and vary the velocities so it's not robotic",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-update-clip", turn: 2, score: 5 },
    {
      type: "response_contains",
      pattern: /swing|velocit|human|feel/i,
      turn: 2,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 2-bar beat with kick, snare on beats 2 and 4, and hi-hats
2. Applied swing (e.g. quantizeSwing or shifted off-beats) so the groove isn't perfectly straight
3. Introduced velocity variation across notes (accents / ghost notes) rather than uniform velocity
4. Kept it musically coherent as a boom-bap groove
Award partial credit if only swing OR only velocity variation was applied.`,
      score: 14,
    },
  ],
};
