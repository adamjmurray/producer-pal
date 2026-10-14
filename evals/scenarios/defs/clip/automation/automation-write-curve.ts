// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: write a curved volume fade-in on the Lead clip.
 *
 * Envelope notation joins points with `/` (straight), `_` (jump) or `~N`
 * (curve: positive bends above the straight line, negative below). A fade that
 * "starts slow and speeds up" rises below the straight line, so it needs a
 * negative `~N`. The model must pick a curve over a straight ramp or steps, and
 * get the sign right.
 *
 * Graded on the read-back: Live prints each ramp it stored as `/` or `~N`, so a
 * straight ramp and a curve read differently. A write that lands on the clip
 * as a straight ramp or a hand-made staircase fails.
 */

import { type EvalScenario } from "../../../types.ts";
import { MSG_CONNECT, TOOL_CONNECT } from "../helpers/clip-tool-constants.ts";
import {
  assertLeadEnvelopes,
  curveAmounts,
  envelopeValues,
  envelopeWrites,
  sortEnvelopes,
  TOOL_READ_CLIP,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-envelope-readback.ts";
import { seedLeadEnvelopes } from "./helpers/seed-clip-envelopes.ts";

/** How far a curve must bend to count as one, not a rounding of a straight line. */
const MIN_BEND = 0.2;

/** A negative curve in a landed write's own notation (the secondary signal). */
const NEGATIVE_CURVE = /\s~-\d/;

export const automationWriteCurve: EvalScenario = {
  id: "automation-write-curve",
  tags: ["automation"],
  description:
    "Write a slow-then-fast volume fade-in as a curved ramp on the Lead clip",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",
  judgeAdvisory: true,
  requires: {
    tools: [TOOL_READ_CLIP, TOOL_UPDATE_CLIP],
    params: ["envelopes"],
  },

  setup: (mcpClient) => seedLeadEnvelopes(mcpClient, []),

  messages: [
    MSG_CONNECT,
    "On the Lead clip, fade the volume in from silence to full over the whole clip. I want it to start slow and speed up toward the end, not a straight line. Use clip automation.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    {
      type: "custom",
      description: "an envelopes write landed",
      assert: (turns) => envelopeWrites(turns).length > 0,
    },

    // One volume envelope, rising from near silence, whose ramp bends below
    // the straight line (slow start) and never above it.
    assertLeadEnvelopes((envelopes) => {
      const { volume } = sortEnvelopes(envelopes);
      const [fade] = volume;

      if (envelopes.length !== 1 || fade == null) {
        return `expected one volume envelope, got ${
          envelopes.map((envelope) => envelope.parameter).join(", ") || "none"
        }`;
      }

      const values = envelopeValues(fade.events);
      const curves = curveAmounts(fade.events);
      const problems: string[] = [];

      if ((values[0] ?? 1) > 0.3 || (values.at(-1) ?? 0) < 0.7) {
        problems.push(
          `volume should run from near silence to near full, got ${values.join(" -> ")}`,
        );
      }

      if (!curves.some((amount) => amount <= -MIN_BEND)) {
        problems.push(
          `expected a ramp that bends below the straight line (~-0.2 or lower), the envelope reads: ${fade.events ?? "no events"}`,
        );
      }

      if (curves.some((amount) => amount >= MIN_BEND)) {
        problems.push("a fast start (positive curve) is the wrong way round");
      }

      return problems.length > 0 ? problems.join("; ") : null;
    }),

    // Secondary: the write itself spelled the curve, not a staircase of steps.
    {
      type: "custom",
      description: "the envelopes write used a negative curve (~-N)",
      assert: (turns) =>
        envelopeWrites(turns).some((call) =>
          NEGATIVE_CURVE.test(` ${String(call.args.envelopes)}`),
        ),
    },

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for the Lead clip's volume to fade in from silence to full,
starting slow and speeding up toward the end rather than rising in a straight
line, using clip automation. Evaluate the final reply: it says a volume fade-in
with that slow-then-fast shape was written on the Lead clip, and does not claim
to have changed anything else.`,
    },
  ],
};
