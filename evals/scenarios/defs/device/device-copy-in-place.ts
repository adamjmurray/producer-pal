// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: copy an effect on the same track, settings and all.
 *
 * With the remote script running, `ppal-duplicate` copies an effect in place.
 * Without it the copy goes through a temporary track, so the end state is the
 * same and only the speed differs: this grades what the user ends up with, not
 * the route.
 *
 * `setup` renames the Lead track's Utility "Lead Trim" and sets its Output to
 * -6 dB, so a copy made by adding a fresh Utility instead fails on both the
 * name and the Output. The Lead's whole chain is read back, so a stray extra
 * device or a copy that landed in the wrong place fails too.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText, parseToolResult } from "#evals/chat/mcp.ts";
import { asSignal, lastSuccessfulToolCall } from "../../assertions/index.ts";
import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import { firstResultPath } from "../helpers/new-track-path.ts";
import { assertTrackChain } from "./helpers/device-chain-readback.ts";
import { paramNumber } from "./helpers/device-param-readback.ts";

const TOOL_DUPLICATE = "ppal-duplicate";
const TOOL_READ_DEVICE = "ppal-read-device";
const TOOL_UPDATE_DEVICE = "ppal-update-device";

/** basic-midi-4-track: the Lead track, and its Utility, the last device on it. */
const LEAD_PATH = "t3";
const UTILITY_PATH = "t3/d3";

const TRIM_NAME = "Lead Trim";
const TRIM_GAIN_DB = -6;

/** The copy lands right after the original, which is where the tool puts it. */
const DEFAULT_COPY_PATH = "t3/d4";

/** Output reads back as the dB it was set to, give or take rounding. */
const GAIN_TOLERANCE_DB = 0.1;

/**
 * Rename the Lead's Utility and set its Output, then check it reads back that
 * way. Throws if it doesn't, so a seed that never took can't pass the scenario
 * for the wrong reason.
 *
 * @param mcpClient - MCP client for tool calls
 */
async function seedLeadTrim(mcpClient: Client): Promise<void> {
  await mcpClient.callTool({
    name: TOOL_UPDATE_DEVICE,
    arguments: {
      path: UTILITY_PATH,
      name: TRIM_NAME,
      params: [{ name: "Output", value: TRIM_GAIN_DB }],
    },
  });

  const read = parseToolResult(
    extractToolResultText(
      await mcpClient.callTool({
        name: TOOL_READ_DEVICE,
        arguments: { path: UTILITY_PATH, include: ["params", "param-values"] },
      }),
    ),
  ) as { name?: string };
  const gain = paramNumber(read, "Output");

  if (read.name !== TRIM_NAME || !isTrimGain(gain)) {
    throw new Error(
      `seeding ${UTILITY_PATH} failed: reads as name "${read.name}", Output ${gain}`,
    );
  }
}

/**
 * Whether an Output reading is the seeded one.
 *
 * @param gain - The Output a read reported
 * @returns True when it is -6 dB, give or take rounding
 */
function isTrimGain(gain: number | undefined): boolean {
  return gain != null && Math.abs(gain - TRIM_GAIN_DB) <= GAIN_TOLERANCE_DB;
}

export const deviceCopyInPlace: EvalScenario = {
  id: "device-copy-in-place",
  tags: ["devices"],
  description: "Copy an effect on the same track with its name and settings",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  requires: { tools: [TOOL_DUPLICATE] },

  setup: seedLeadTrim,

  messages: [
    MSG_CONNECT,
    "Make a second copy of the Lead Trim device on the Lead track, right after the original.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // The chain was Pitch, instrument rack, Channel EQ, Utility.
    assertTrackChain(LEAD_PATH, [
      { type: "Pitch" },
      { type: "instrument-rack" },
      { type: "Channel EQ" },
      { type: "Utility", name: TRIM_NAME },
      { type: "Utility", name: TRIM_NAME },
    ]),

    // The copy, wherever the model's own call reports it, carries the Output.
    {
      type: "state",
      tool: TOOL_READ_DEVICE,
      args: (turns) => ({
        path:
          firstResultPath(
            lastSuccessfulToolCall(turns, "any", TOOL_DUPLICATE)?.result,
          ) ?? DEFAULT_COPY_PATH,
        include: ["params", "param-values"],
      }),
      expect: (result) => isTrimGain(paramNumber(result, "Output")),
      explain: (result) =>
        `expected the copy's Output to be ${TRIM_GAIN_DB} dB, got ${paramNumber(result, "Output")}`,
    },

    asSignal({
      type: "custom",
      description: "copied with ppal-duplicate",
      assert: (turns) =>
        lastSuccessfulToolCall(turns, "any", TOOL_DUPLICATE) != null,
    }),

    { type: "token_usage", maxTokens: 2_500 },
  ],
};
