// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: clear one envelope and leave the others.
 *
 * `setup` seeds volume, pan and send A on the Lead clip. The model is asked to
 * drop only the pan. Read back, the pan is gone and the other two still hold
 * their seeded points; a model that cleared everything, or rewrote the others,
 * fails.
 */

import { type EvalScenario } from "../../../types.ts";
import { MSG_CONNECT, TOOL_CONNECT } from "../helpers/clip-tool-constants.ts";
import {
  assertLeadEnvelopes,
  envelopeValues,
  sortEnvelopes,
  TOOL_READ_CLIP,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-envelope-readback.ts";
import {
  LEAD_SEEDS,
  seedLeadEnvelopes,
} from "./helpers/seed-clip-envelopes.ts";

/** Compare seeded values with slack: Live stores them as floats. */
const TOLERANCE = 0.01;

export const automationClearOne: EvalScenario = {
  id: "automation-clear-one",
  tags: ["automation"],
  description: "Clear the pan automation on the Lead clip, keeping the rest",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",
  judgeAdvisory: true,
  requires: {
    tools: [TOOL_READ_CLIP, TOOL_UPDATE_CLIP],
    params: ["envelopes"],
  },

  setup: (mcpClient) => seedLeadEnvelopes(mcpClient, LEAD_SEEDS),

  messages: [
    MSG_CONNECT,
    "Remove the pan automation from the Lead clip, but leave its other automation alone.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 1 },

    assertLeadEnvelopes((envelopes) => {
      const { volume, pan, sends } = sortEnvelopes(envelopes);
      const [volumeKept] = volume;
      const [sendKept] = sends;

      if (pan.length > 0) {
        return "the pan envelope is still there";
      }

      if (volumeKept == null || sendKept == null || envelopes.length !== 2) {
        return `expected only volume and a send left, got ${
          envelopes.map((envelope) => envelope.parameter).join(", ") || "none"
        }`;
      }

      for (const [kept, seedName] of [
        [volumeKept, "volume"],
        [sendKept, "send0"],
      ] as const) {
        const values = envelopeValues(kept.events);
        const expected =
          LEAD_SEEDS.find((seed) => seed.parameter === seedName)?.points.map(
            (point) => point.value,
          ) ?? [];

        if (
          values.length !== expected.length ||
          values.some(
            (value, i) =>
              Math.abs(value - (expected[i] ?? Number.NaN)) > TOLERANCE,
          )
        ) {
          return `${kept.parameter} changed: ${values.join(", ")}, seeded ${expected.join(", ")}`;
        }
      }

      return null;
    }),

    { type: "token_usage", maxTokens: 3_000 },

    {
      type: "llm_judge",
      prompt: `The Lead clip had volume, pan and send A automation. The user asked to
remove only the pan automation. Evaluate the final reply: it says the pan
automation was removed and the volume and send automation were left in place. It
does not claim to have removed anything else.`,
    },
  ],
};
