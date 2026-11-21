// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: read, then rewrite, the automation in an envelope clip on a return
 * track (Live 13).
 *
 * Return tracks hold envelope clips, which Producer Pal can read and rewrite
 * but never create. rt1/s0 ("With Env", on B-Wide Hallway) automates the
 * reverb's Predelay; rt0/s0 ("No Envs") has none. The user asks what is in the
 * clip, then for a steady rise across the bar. The end state pins the write;
 * envelope ids differ per load, so none are hardcoded.
 */

import { type EvalScenario } from "../../../types.ts";
import {
  assertEnvelopeWriteLanded,
  envelopesOf,
} from "../automation/helpers/clip-envelope-readback.ts";
import { LIVE_13_TEST_SET } from "../../helpers/live-13-test-set.ts";
import {
  returnClipMisuse,
  returnEnvelopeProblem,
} from "./helpers/return-envelope.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

export const returnEnvelopeClip: EvalScenario = {
  id: "live-13-return-envelope-clip",
  tags: ["automation", "clips"],
  description:
    "Read an envelope clip on a return track, then make its Predelay rise across the bar",
  kind: "capability",
  liveSet: LIVE_13_TEST_SET,
  judgeAdvisory: true,
  requires: {
    liveVersion: 13,
    tools: [TOOLS.readClip, TOOLS.updateClip],
    params: ["envelopes"],
  },

  messages: [
    "Connect to Ableton Live",
    "What automation is in the clip on the B-Wide Hallway return?",
    "Make the predelay rise steadily across the whole bar instead.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },
    { type: "tool_called", tool: TOOLS.readClip, turn: 1 },
    { type: "response_contains", pattern: /predelay/i, turn: 1 },
    assertEnvelopeWriteLanded(),

    // The clip is still an envelope clip with one Predelay envelope that runs
    // from the first beat up to the end of the bar.
    {
      type: "state",
      tool: TOOLS.readClip,
      args: { path: "rt1/s0", include: ["envelopes"] },
      expect: (result) => returnEnvelopeProblem(result) == null,
      explain: (result) => returnEnvelopeProblem(result) ?? "",
    },

    // The clip on the other return was not touched.
    {
      type: "state",
      tool: TOOLS.readClip,
      args: { path: "rt0/s0", include: ["envelopes"] },
      expect: (result) =>
        (result as { type?: string }).type === "envelope" &&
        envelopesOf(result).length === 0,
      explain: () =>
        "rt0/s0 should still be an envelope clip with no envelopes",
    },

    {
      type: "custom",
      description: "no clip created on a return track, no notes written",
      assert: (turns) => {
        const misuse = returnClipMisuse(turns);

        if (misuse.length > 0) {
          throw new Error(misuse.join("; "));
        }

        return true;
      },
    },

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The Set's B-Wide Hallway return track has an envelope clip automating the
reverb's Predelay. Turn 1 asked what automation the clip holds: the reply
should name the Predelay envelope and give its points roughly right. Turn 2
asked for the Predelay to rise steadily across the whole bar: the reply should
say it now does.`,
    },
  ],
};
