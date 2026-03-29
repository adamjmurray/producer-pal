// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Apply swing and quantize to existing MIDI clips.
 */

import { expect } from "vitest";
import { getToolCalls } from "../../assertions/index.ts";
import { type EvalScenario } from "../../types.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";

export const swingAndQuantize: EvalScenario = {
  id: "swing-and-quantize",
  description: "Apply swing and quantize to existing MIDI clips",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",

  messages: [
    "Connect to Ableton Live",
    "Find the drum clip in the first scene and read the notes",
    "Add swing to the closed hats",
    "That's a little too much. Lower the amount of swing",
    "I changed my mind. Quantize the hats to the 16th note grid",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Clip state is read
    {
      type: "custom",
      description: "clip was found and read",
      assert: (turns) => {
        const calls = getToolCalls(turns, 1);
        let notesRead = false;

        for (const { name, args } of calls) {
          if (!name.startsWith("ppal-read-")) {
            throw new Error(`unexpected non-read tool call: ${name}`);
          }

          if (
            name !== "ppal-read-live-set" &&
            Array.isArray(args.include) &&
            args.include.includes("notes")
          ) {
            notesRead = true;
          }
        }

        if (!notesRead) {
          throw new Error("the clip notes should have been read");
        }

        return true;
      },
    },

    // Turn 2: Swing applied
    {
      type: "tool_called",
      tool: TOOL_UPDATE_CLIP,
      turn: 2,
      args: expect.objectContaining({
        ids: expect.any(String),
        transforms: expect.stringMatching(/Ab1: timing = swing\(0\.\d+/),
      }) as Record<string, unknown>,
    },

    // Turn 3: Swing re-applied with lower amount (auto-quantize handles grid alignment)
    {
      type: "tool_called",
      tool: TOOL_UPDATE_CLIP,
      turn: 3,
      args: expect.objectContaining({
        ids: expect.any(String),
        transforms: expect.stringMatching(/Ab1: timing = swing\(0\.\d+/),
      }) as Record<string, unknown>,
    },

    // Turn 3: Swing amount is lower than turn 2
    {
      type: "custom",
      description: "swing amount in turn 3 is lower than turn 2",
      assert: (turns) => {
        const swingPattern = /swing\((0\.\d+)/;

        /**
         * @param turn - Turn index to extract swing amount from
         * @returns Parsed swing amount
         */
        const getSwingAmount = (turn: number): number => {
          const calls = getToolCalls(turns, turn);

          const updateCall = calls.find((c) => c.name === TOOL_UPDATE_CLIP);

          const transforms = String(updateCall?.args.transforms ?? "");
          const match = swingPattern.exec(transforms);

          if (!match) {
            throw new Error(`no swing() found in turn ${turn} transforms`);
          }

          return Number.parseFloat(match[1] as string);
        };

        const turn2Amount = getSwingAmount(2);
        const turn3Amount = getSwingAmount(3);

        if (turn3Amount >= turn2Amount) {
          throw new Error(
            `swing in turn 3 (${turn3Amount}) should be less than turn 2 (${turn2Amount})`,
          );
        }

        return true;
      },
    },

    // Turn 4: Quantize applied to remove swing
    {
      type: "tool_called",
      tool: TOOL_UPDATE_CLIP,
      turn: 4,
      args: expect.objectContaining({
        ids: expect.any(String),
        transforms: expect.stringMatching(
          /Ab1: timing = quant\((1\/4t|0\.25)\)/,
        ),
      }) as Record<string, unknown>,
    },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Found and read the drum clip with its notes
2. Applied swing to the hat notes (not kick/snare)
3. When asked to lower the swing, re-applied swing with a smaller amount
4. When asked to remove swing, applied quant() to snap hats back to the grid
5. Confirmed each step was completed`,
    },
  ],
};
