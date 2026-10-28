// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: Create a drum clip, add notes, and quantize
 */

import { getToolCalls } from "../../assertions/index.ts";
import { requireToolCall } from "./helpers/clip-turn-readers.ts";
import { type EvalScenario } from "../../types.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";
const SIXTEENTH_GRIDS = new Set(["1/16", "n/16"]);

export const createAndEditClip: EvalScenario = {
  id: "create-and-edit-clip",
  tags: ["clips"],
  description: "Create a drum clip, add notes, and quantize",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The checks below pin the outcome. The judge only adds commentary they
  // can't anticipate — hallucinations, misleading prose, extra steps.
  judgeAdvisory: true,

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

    // Verify notes use bar|beat notation (regression test). Writing them with
    // a follow-up update-clip on an empty new clip is a valid way to get there.
    {
      type: "custom",
      description: "turn 1 writes its notes in bar|beat notation",
      assert: (turns) => {
        const notes = getToolCalls(turns, 1)
          .filter(
            (c) => c.name === "ppal-create-clip" || c.name === TOOL_UPDATE_CLIP,
          )
          .map((c) => c.args.notes)
          .find((n) => n != null);

        if (typeof notes !== "string") {
          throw new Error("no notes string written in turn 1");
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

    // Any of the three ways to quantize counts: `quantize`, `quantizeGrid`
    // alone (full strength), or a `quant()` transform.
    {
      type: "custom",
      description: "ppal-update-clip quantizes to 1/16",
      assert: (turns) => {
        const { args } = requireToolCall(turns, 3, TOOL_UPDATE_CLIP, "last");
        const grid = args.quantizeGrid as string | undefined;

        if (args.quantize != null || grid != null) {
          if (grid != null && !SIXTEENTH_GRIDS.has(grid)) {
            throw new Error(`quantized to ${grid}, not 1/16`);
          }

          return true;
        }

        const transforms = args.transforms;

        if (
          typeof transforms === "string" &&
          /quant\(\s*n\/16\s*\)/.test(transforms)
        ) {
          return true;
        }

        throw new Error("no quantize, quantizeGrid or quant(n/16) transform");
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
      maxTokens: 4_500,
    },
  ],
};
