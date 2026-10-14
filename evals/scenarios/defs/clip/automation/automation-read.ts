// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: read a clip's automation and describe it.
 *
 * `setup` seeds three envelopes on the Lead clip through the remote script
 * (volume rising, pan stepping left to right, send A rising), so what the model
 * reads wasn't written by the tool it reads with. Envelopes aren't in a default
 * clip read, so the model has to ask for them by name.
 *
 * Gated on what was done: it asked for the envelopes, and changed nothing. The
 * judge grades the description against the seeded shapes.
 */

import { getToolCalls } from "../../../assertions/index.ts";
import { type EvalScenario, type EvalTurnResult } from "../../../types.ts";
import { MSG_CONNECT, TOOL_CONNECT } from "../helpers/clip-tool-constants.ts";
import {
  assertLeadEnvelopes,
  envelopeWrites,
  TOOL_READ_CLIP,
} from "./helpers/clip-envelope-readback.ts";
import {
  LEAD_SEEDS,
  seedLeadEnvelopes,
} from "./helpers/seed-clip-envelopes.ts";

/** The turn carrying the question; turn 0 is always connect. */
const ASK_TURN = 1;

/**
 * The model asked for the `envelopes` include and got them.
 *
 * @param turns - All conversation turns
 * @returns True when a read-clip call with that include succeeded
 */
function readEnvelopes(turns: EvalTurnResult[]): boolean {
  const asked = getToolCalls(turns, ASK_TURN).some(
    (call) =>
      call.name === TOOL_READ_CLIP &&
      Array.isArray(call.args.include) &&
      call.args.include.includes("envelopes"),
  );

  if (!asked) {
    throw new Error('no ppal-read-clip call asked for include: ["envelopes"]');
  }

  return true;
}

export const automationReadEnvelopes: EvalScenario = {
  id: "automation-read-envelopes",
  tags: ["automation"],
  description: "Read the automation on the Lead clip and describe what it does",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",
  requires: {
    tools: [TOOL_READ_CLIP],
    params: ["envelopes"],
  },

  setup: (mcpClient) => seedLeadEnvelopes(mcpClient, LEAD_SEEDS),

  messages: [MSG_CONNECT, "What automation does the Lead clip have?"],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    {
      type: "custom",
      description: "asked for the clip's envelopes",
      assert: readEnvelopes,
    },
    {
      type: "custom",
      description: "wrote no automation",
      assert: (turns) => envelopeWrites(turns).length === 0,
    },

    // The seeded automation is still all there, untouched. Live stores a jump
    // as two events (before and after), so it counts twice.
    assertLeadEnvelopes((envelopes) => {
      const expected = LEAD_SEEDS.map(
        (seed) => seed.points.length + seed.points.filter((p) => p.jump).length,
      ).toSorted((a, b) => a - b);
      const got = envelopes
        .map((envelope) => envelope.eventCount)
        .toSorted((a, b) => a - b);

      return got.join() === expected.join()
        ? null
        : `expected event counts ${expected.join(", ")}, got ${envelopes
            .map((envelope) => `${envelope.parameter}: ${envelope.eventCount}`)
            .join(", ")}`;
    }),

    // Wording varies, so these are signals, not gates.
    { type: "response_contains", pattern: /volume/i, turn: ASK_TURN },
    { type: "response_contains", pattern: /pan/i, turn: ASK_TURN },
    { type: "response_contains", pattern: /send|\bA\b/i, turn: ASK_TURN },

    { type: "token_usage", maxTokens: 2_500 },

    {
      type: "llm_judge",
      prompt: `The Lead clip is 2 bars of 4/4 and carries three automation envelopes:
- Volume: rises from about 0.4 at bar 1 beat 1 to 0.85 (0 dB) at bar 2 beat 1.
- Pan: sits left (-0.5) for bar 1, then jumps to the right (0.5) at bar 2.
- Send A: rises from about 0.1 at the start to 0.7 around bar 2 beat 3.

Evaluate the assistant's final reply:
1. It names all three automated parameters: volume, pan and a send.
2. Each is described with the right direction: volume and send rise, pan goes
   from left to right, with the pan change a sudden step rather than a glide.
3. It does not invent automation the clip doesn't have, and does not report the
   clip as having none.
Raw values, display units (dB, %) and bar|beat positions are all fine, and so is
a rough description. Do not penalize small numeric differences from the values
above.`,
    },
  ],
};
