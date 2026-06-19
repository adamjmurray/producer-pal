// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Build an arrangement — create an arrangement clip, duplicate it to
 * fill a section, add a locator, and play the arrangement.
 */

import { type EvalScenario } from "../../types.ts";

export const arrangementWorkflow: EvalScenario = {
  id: "arrangement-workflow",
  description: "Create, duplicate, and play Arrangement-view clips",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Drums track, create a 4-bar drum pattern at the very start of the Arrangement (kick on every beat)",
    "Repeat that clip three more times so the drums play continuously through the first 16 bars of the arrangement",
    "Add a locator named 'Verse' at bar 1, then start playing the arrangement from the beginning",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },

    // Turn 1: Create an arrangement clip (trackIndex + arrangementStart)
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },

    // Turn 2: Duplicate the clip across the arrangement
    { type: "tool_called", tool: "ppal-duplicate", turn: 2, score: 5 },

    // Turn 3: Add a locator, then play the arrangement
    { type: "tool_called", tool: "ppal-update-live-set", turn: 3, score: 4 },
    { type: "tool_called", tool: "ppal-playback", turn: 3, score: 5 },

    // Response sanity checks
    {
      type: "response_contains",
      pattern: /arrangement|drum/i,
      turn: 1,
      score: 2,
    },
    {
      type: "response_contains",
      pattern: /16 bars?|repeat|duplicat|times/i,
      turn: 2,
      score: 2,
    },
    {
      type: "response_contains",
      pattern: /verse|locator|play/i,
      turn: 3,
      score: 2,
    },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 4-bar drum pattern as an Arrangement clip on the Drums track (not a Session clip)
2. Repeated it to cover roughly the first 16 bars of the arrangement
3. Added a locator named "Verse"
4. Started arrangement playback`,
      score: 10,
    },
  ],
};
