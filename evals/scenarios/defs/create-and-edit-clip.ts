// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create a drum clip, add notes, and quantize
 */

import { getToolCalls } from "../assertions/index.ts";
import { type EvalScenario } from "../types.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";

export const createAndEditClip: EvalScenario = {
  id: "create-and-edit-clip",
  description: "Create a drum clip, add notes, and quantize",
  kind: "regression",
  liveSet: "basic-midi-4-track",

  messages: [
    "Connect to Ableton Live",
    "Create a 4-bar drum clip with kick on every beat and snare on 2 and 4",
    "Add hi-hats on every 8th note",
    "Quantize all the notes to 1/16",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Clip creation
    { type: "tool_called", tool: "ppal-create-clip", turn: 1 },

    // Verify notes use bar|beat notation (regression test)
    {
      type: "custom",
      description: "ppal-create-clip uses bar|beat notation in notes",
      assert: (turns) => {
        const calls = getToolCalls(turns, 1);
        const createCall = calls.find((c) => c.name === "ppal-create-clip");

        if (!createCall) throw new Error("ppal-create-clip not found");
        const notes = createCall.args.notes;

        if (typeof notes !== "string") {
          throw new Error("notes parameter missing or not a string");
        }

        if (!/\d+\|\d/.test(notes)) {
          throw new Error(
            `notes does not use bar|beat notation: ${notes.slice(0, 80)}`,
          );
        }

        return true;
      },
    },

    // Turn 2: Note addition (merge mode)
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },

    // Turn 3: Quantization
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3 },

    // Verify quantize parameter is used
    {
      type: "custom",
      description: "ppal-update-clip uses quantize parameter",
      assert: (turns) => {
        const calls = getToolCalls(turns, 3);
        const updateCall = calls.find((c) => c.name === TOOL_UPDATE_CLIP);

        if (!updateCall)
          throw new Error("ppal-update-clip not found in turn 3");

        if (updateCall.args.quantize == null) {
          throw new Error("Missing quantize parameter");
        }

        return true;
      },
    },

    // Verify response mentions the drum creation
    {
      type: "response_contains",
      pattern: /drum|kick|snare/i,
      turn: 1,
    },

    // Verify response mentions hi-hats
    { type: "response_contains", pattern: /hi-?hat/i, turn: 2 },

    // Verify response mentions quantization
    { type: "response_contains", pattern: /quantiz/i, turn: 3 },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 4-bar drum clip with kick and snare
2. Added hi-hats as requested
3. Applied quantization
4. Confirmed each step was completed`,
    },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 100_000,
    },
  ],
};
