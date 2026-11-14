// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: a request to add a chain to a rack that can't take one (Live 13).
 *
 * The Racks track holds a Mid-Side Rack, whose chains are fixed at Mid and
 * Side. Adding or copying a chain is refused, and read-device reports the
 * limit as `maxChains`. The user asks for a third chain, then settles for the
 * Utility on Side. A model may refuse from `maxChains` alone, without ever
 * trying, so no call is required in turn 1.
 */

import { type EvalScenario } from "../../../types.ts";
import { assertTrackChain } from "../helpers/device-chain-readback.ts";
import { LIVE_13_TEST_SET } from "../../helpers/live-13-test-set.ts";
import { rackChainsProblem } from "./helpers/rack-chains.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

const FIXED_CHAINS = /has a fixed 2 chains/;

export const fixedChainRack: EvalScenario = {
  id: "live-13-fixed-chain-rack",
  tags: ["devices"],
  description:
    "Asked for a third chain on a fixed two-chain rack, explain it can't, then use the Side chain",
  kind: "capability",
  liveSet: LIVE_13_TEST_SET,
  judgeAdvisory: true,
  requires: {
    liveVersion: 13,
    tools: [TOOLS.createDevice, TOOLS.readDevice],
  },

  messages: [
    "Connect to Ableton Live",
    "Add a third chain to the Mid-Side Rack on the Racks track with a Utility on it.",
    "OK, put the Utility on the Side chain then.",
  ],

  // A refused attempt is the behavior under test, not a model mistake.
  expectedRefusals: [
    { tool: TOOLS.createDevice, message: FIXED_CHAINS },
    { tool: TOOLS.duplicate, message: FIXED_CHAINS },
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },

    // Still Mid and Side, with the Utility on Side alone.
    {
      type: "state",
      tool: TOOLS.readDevice,
      args: { path: "t1/d0", include: ["chains"], maxDepth: 0 },
      expect: (result) => rackChainsProblem(result) == null,
      explain: (result) => rackChainsProblem(result) ?? "",
    },
    {
      type: "state",
      tool: TOOLS.readDevice,
      args: { path: "t1/d0/c1/d0" },
      expect: (result) =>
        String((result as { type?: string }).type).includes("Utility"),
      explain: () => "the device on the Side chain should be a Utility",
    },

    // The track still holds just its two racks: no Utility dropped beside them.
    assertTrackChain("t1", [
      { type: "audio-effect-rack" },
      { type: "audio-effect-rack" },
    ]),

    {
      type: "response_contains",
      pattern: /fixed|two chains|can't|cannot/i,
      turn: 1,
    },
    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The Mid-Side Rack has a fixed pair of chains, Mid and Side, and can't take
another. Evaluate the turn 1 reply: it explains that the rack is fixed at Mid
and Side and does not claim a third chain was added.`,
    },
  ],
};
