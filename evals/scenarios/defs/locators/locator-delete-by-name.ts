// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: deleting a locator name that two locators share.
 *
 * A delete by name removes EVERY locator with that name, and a delete by time
 * removes the one at that position. The risk is a model that deletes one Hook
 * and calls it done, or one that reaches for the wrong Hook by time. Only the
 * Set read back after the run gates, so any route that ends right passes: the
 * name alone, both ids, or both times. That a delete operation ran, and that
 * the ids sent were Live's own, are reported as signals.
 *
 * `setup` makes the duplicates with one list create, so the scenario doesn't
 * depend on a Live Set that happens to carry them.
 *
 * Gated on `locatorOperation`: small-model mode hides every locator param.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText } from "#evals/chat/mcp.ts";
import { asSignal } from "../../assertions/index.ts";
import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import {
  TOOL_UPDATE_LIVE_SET,
  assertLocatorIdsAreLives,
  assertLocatorsAre,
  locatorCalls,
} from "./locator-readback.ts";

/**
 * Create Hook, Verse, Hook and Chorus at bars 1, 5, 9 and 13.
 *
 * @param mcpClient - MCP client for tool calls
 * @throws When the create fails, so the run doesn't grade a Set it never built
 */
async function seedLocators(mcpClient: Client): Promise<void> {
  const result = await mcpClient.callTool({
    name: TOOL_UPDATE_LIVE_SET,
    arguments: {
      locatorOperation: "create",
      locatorTime: "1|1,5|1,9|1,13|1",
      locatorName: "Hook,Verse,Hook,Chorus",
    },
  });

  if (result.isError === true) {
    throw new Error(
      `seeding locators failed: ${extractToolResultText(result)}`,
    );
  }
}

export const locatorDeleteByName: EvalScenario = {
  id: "locator-delete-by-name",
  tags: ["workflow"],
  description: "Delete a locator name shared by two locators, then one by time",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  requires: { params: ["locatorOperation"] },
  setup: seedLocators,

  messages: [
    MSG_CONNECT,
    "Delete every locator called Hook.",
    "Now delete the locator at bar 13.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    {
      type: "custom",
      signal: true,
      description: "turn 1: deleted locators with a delete operation",
      assert: (turns) => locatorCalls(turns, 1, "delete").length > 0,
    },
    {
      type: "custom",
      signal: true,
      description: "turn 2: deleted a locator with a delete operation",
      assert: (turns) => locatorCalls(turns, 2, "delete").length > 0,
    },
    asSignal(assertLocatorIdsAreLives()),

    // Both Hooks gone, Chorus gone, Verse untouched.
    assertLocatorsAre([{ name: "Verse", time: "5|1" }]),

    { type: "token_usage", maxTokens: 3_000 },
  ],
};
