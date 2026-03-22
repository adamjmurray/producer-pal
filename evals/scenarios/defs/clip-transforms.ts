// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create a clip and apply velocity transforms
 */

import { getToolCalls } from "../assertions/index.ts";
import { type EvalScenario } from "../types.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";

export const clipTransforms: EvalScenario = {
  id: "clip-transforms",
  description: "Create a clip and apply velocity transforms",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a 4-bar hi-hat pattern on the Drums track with 8th notes",
    "Add a velocity crescendo from 40 to 127 over the 4 bars",
    "Humanize the timing slightly",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0, score: 5 },

    // Turn 1: Clip creation
    { type: "tool_called", tool: "ppal-create-clip", turn: 1, score: 5 },

    // Turn 2: Velocity transform
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2, score: 5 },

    // Verify transforms parameter is used (not notes or code)
    {
      type: "custom",
      description: "ppal-update-clip uses transforms parameter for velocity",
      assert: (turns) => {
        const calls = getToolCalls(turns, 2);
        const updateCall = calls.find((c) => c.name === TOOL_UPDATE_CLIP);

        if (!updateCall)
          throw new Error("ppal-update-clip not found in turn 2");

        if (typeof updateCall.args.transforms !== "string") {
          throw new Error(
            "transforms parameter missing — used notes or code instead?",
          );
        }

        return true;
      },
      score: 5,
    },

    // Verify transform expression references velocity
    {
      type: "custom",
      description: "transform expression references velocity",
      assert: (turns) => {
        const calls = getToolCalls(turns, 2);
        const updateCall = calls.find((c) => c.name === TOOL_UPDATE_CLIP);

        if (!updateCall)
          throw new Error("ppal-update-clip not found in turn 2");
        const transforms = String(updateCall.args.transforms ?? "");

        if (!/velocity/i.test(transforms)) {
          throw new Error(
            `transforms does not reference velocity: ${transforms.slice(0, 80)}`,
          );
        }

        return true;
      },
      score: 3,
    },

    // Turn 3: Humanize timing
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3, score: 5 },

    // Response checks
    { type: "response_contains", pattern: /hi-?hat/i, turn: 1, score: 2 },
    {
      type: "response_contains",
      pattern: /velocity|crescendo/i,
      turn: 2,
      score: 2,
    },
    { type: "response_contains", pattern: /humaniz/i, turn: 3, score: 2 },

    // Token usage
    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 100_000,
      upperLimit: 150_000,
      score: 5,
    },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 4-bar hi-hat pattern with 8th notes
2. Applied a velocity crescendo using transforms (not rewriting all notes)
3. Applied humanization
4. Confirmed each step was completed`,
    },
  ],
};
