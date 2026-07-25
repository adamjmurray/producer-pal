// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Seeding the opening "connect" turn.
 *
 * Almost every scenario opens by asking the model to connect to Ableton Live,
 * and every model answers the same way: one `ppal-connect` call, then a
 * sentence acknowledging it. That turn is pure setup — the behavior under test
 * starts at the NEXT message — but it is the most expensive turn in the run,
 * because the connect result (Live Set overview + the Producer Pal skills) is
 * re-sent as input on the round trip that produces the acknowledgment.
 *
 * So we write the turn into history ourselves instead of buying it. The tool
 * result is not a recording: `ppal-connect` is called for real over MCP against
 * the Live Set that is actually open, under the run's actual config, so it
 * needs no cache and cannot go stale. Only the assistant's closing sentence is
 * canned, and the model reads the same context either way — the overview and
 * skills reach it through the tool result, exactly as they would have.
 *
 * `ppal-connect` takes no arguments and only reads, so calling it directly is
 * equivalent to the model calling it.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type JSONValue } from "ai";
import { extractToolResultText } from "#evals/chat/mcp.ts";
import { type EvalSession } from "../../eval-session.ts";
import { type EvalScenario, type EvalTurnResult } from "../../types.ts";

/** The opening message shared by nearly every scenario. */
export const CONNECT_MESSAGE = "Connect to Ableton Live";

/** The tool a connect turn calls. */
export const CONNECT_TOOL = "ppal-connect";

/**
 * The assistant's closing line for a seeded connect turn.
 *
 * Deliberately contentless: the Live Set details live in the tool result right
 * above it, and any specifics here would be a second place to keep in sync —
 * and could satisfy a later scenario's `response_contains` by accident.
 */
export const SEEDED_CONNECT_REPLY =
  "Connected to Ableton Live. I have the Live Set overview and the Producer " +
  "Pal skills — ready when you are.";

/**
 * Decide whether a scenario's first turn can be seeded.
 *
 * @param scenario - The scenario about to run
 * @param enabled - Whether seeding is enabled for this run at all (`--no-seed-connect` turns it off)
 * @returns True when turn 0 should be seeded rather than sent to the model
 */
export function shouldSeedConnect(
  scenario: EvalScenario,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (scenario.seedConnect === false) return false;
  if (scenario.messages[0] !== CONNECT_MESSAGE) return false;

  // A scenario whose only message is the connect message IS the connect test —
  // seeding it would leave nothing the model produced to grade.
  return scenario.messages.length > 1;
}

/**
 * Run the connect turn without the model: call `ppal-connect` over MCP, write
 * the whole exchange into the session's history, and report it as a turn.
 *
 * @param session - The active eval session (must support `seedTurn`)
 * @param message - The user message that opens the turn
 * @returns The turn result to record at index 0, carrying no token usage
 */
export async function seedConnectTurn(
  session: EvalSession & { seedTurn: NonNullable<EvalSession["seedTurn"]> },
  message: string,
): Promise<EvalTurnResult> {
  const startTime = Date.now();
  const output = await callConnect(session.mcpClient);

  session.seedTurn({
    userMessage: message,
    toolName: CONNECT_TOOL,
    toolArgs: {},
    toolOutput: output,
    assistantText: SEEDED_CONNECT_REPLY,
  });

  return {
    turnIndex: 0,
    userMessage: message,
    assistantResponse: SEEDED_CONNECT_REPLY,
    toolCalls: [
      // The recorded string is the first text block, matching what the streaming
      // path records for a real call — grading and the judge transcript read the
      // same thing either way. History gets the whole array; see `seeded-turn.ts`.
      { name: CONNECT_TOOL, args: {}, result: extractToolResultText(output) },
    ],
    durationMs: Date.now() - startTime,
    // No stepUsages: nothing was spent, and an empty-usage entry would read as
    // a real round trip that happened to cost zero.
    seeded: true,
  };
}

/**
 * Call `ppal-connect` and return its content blocks.
 *
 * @param mcpClient - MCP client for the open Live Set
 * @returns The content array the model would have received
 */
async function callConnect(mcpClient: Client): Promise<JSONValue> {
  const result = await mcpClient.callTool({
    name: CONNECT_TOOL,
    arguments: {},
  });
  const content = result.content as JSONValue;

  if (!extractToolResultText(content)) {
    throw new Error(
      `${CONNECT_TOOL} returned no text — cannot seed the connect turn`,
    );
  }

  return content;
}
