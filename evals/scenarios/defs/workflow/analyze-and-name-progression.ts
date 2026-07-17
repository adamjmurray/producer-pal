// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create a progression, then read it back and name the chords
 */

import { type EvalScenario } from "../../types.ts";

export const analyzeAndNameProgression: EvalScenario = {
  id: "analyze-and-name-progression",
  description: "Write a progression, then analyze the clip and name the chords",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Chords track, write a 4-bar progression: C, Am, F, G (one chord per bar)",
    "Now read that clip back and tell me the chord progression you find in it, naming each chord.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 4 },
    { type: "tool_called", tool: "ppal-read-clip", turn: 2, score: 5 },
    {
      type: "response_contains",
      pattern: /C|Am|F|G/,
      turn: 2,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 4-bar C - Am - F - G chord clip on the Chords track
2. Read the clip's actual note content back (rather than just repeating what it wrote)
3. Correctly identified the chords from the notes: C, Am, F, G in order
4. Named them as real chord symbols and got the qualities right (major vs minor)
Award partial credit for identifying most chords correctly.`,
      score: 14,
    },
  ],
};
