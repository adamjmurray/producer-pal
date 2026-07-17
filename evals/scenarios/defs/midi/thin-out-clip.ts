// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Edit an existing clip to remove notes (thin it out)
 */

import { type EvalScenario } from "../../types.ts";

export const thinOutClip: EvalScenario = {
  id: "thin-out-clip",
  description: "Create a busy hi-hat clip, then thin it out by half",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "On the Drums track, make a 1-bar clip with a hi-hat on every 16th note (16 hits)",
    "That's too busy. Thin the hi-hats down to 8th notes by removing every other hit.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },
    { type: "tool_called", tool: "ppal-update-clip", turn: 2, score: 5 },
    {
      type: "response_contains",
      pattern: /thin|remov|8th|eighth|every other/i,
      turn: 2,
      score: 2,
    },
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 1-bar clip with 16 hi-hat hits (16th notes)
2. Edited the EXISTING clip to remove every other hi-hat, leaving 8 hits on the 8th notes
3. Removed the correct (off-beat 16th) notes so the remaining hits land evenly on 8th notes
4. Did not just regenerate an unrelated clip`,
      score: 12,
    },
  ],
};
