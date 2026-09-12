// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Apply swing and quantize to existing MIDI clips.
 */

import { argText } from "../../arg-text.ts";
import { expect } from "vitest";
import { getToolCalls } from "../../../assertions/index.ts";
import { type EvalScenario } from "../../../types.ts";
import { assertNamesTarget } from "../../path/path-scenario-helpers.ts";
import { assertNotesRead } from "../helpers/clip-scenario-helpers.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";

export const swingAndQuantize: EvalScenario = {
  id: "swing-and-quantize",
  description: "Apply swing and quantize to existing MIDI clips",
  kind: "capability",
  requires: { transforms: true },
  liveSet: "basic-with-drum-and-lead-clips",

  messages: [
    "Connect to Ableton Live",
    "Find the drum clip in the first scene and read the notes",
    "Add swing to the hi-hats in that clip",
    "That's a little too much. Lower the amount of swing",
    "I changed my mind. Quantize the hats to the 16th note grid",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Clip state is read
    assertNotesRead(1),

    // Turn 2: Swing applied
    {
      type: "tool_called",
      tool: TOOL_UPDATE_CLIP,
      turn: 2,
      args: expect.objectContaining({
        // transforms is a single newline-separated string (de-arrayed);
        // stringMatching does a substring search across all transform lines.
        transforms: expect.stringMatching(/Ab1: timing = swing\(0\.\d+/),
      }) as Record<string, unknown>,
    },
    assertNamesTarget({ turn: 2, tool: TOOL_UPDATE_CLIP }),

    // Turn 3: Swing re-applied with lower amount (auto-quantize handles grid alignment)
    {
      type: "tool_called",
      tool: TOOL_UPDATE_CLIP,
      turn: 3,
      args: expect.objectContaining({
        // transforms is a single newline-separated string (de-arrayed);
        // stringMatching does a substring search across all transform lines.
        transforms: expect.stringMatching(/Ab1: timing = swing\(0\.\d+/),
      }) as Record<string, unknown>,
    },
    assertNamesTarget({ turn: 3, tool: TOOL_UPDATE_CLIP }),

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

          const transforms = argText(updateCall?.args.transforms);
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
        // 16th-note grid: n/16 (absolute note value) or 0.25 (bare beats, =
        // a 16th in 4/4). The old synced-period form 1/4t was removed.
        transforms: expect.stringMatching(
          /Ab1: timing = quant\((n\/16|0\.25)\)/,
        ),
      }) as Record<string, unknown>,
    },
    assertNamesTarget({ turn: 4, tool: TOOL_UPDATE_CLIP }),
  ],
};
