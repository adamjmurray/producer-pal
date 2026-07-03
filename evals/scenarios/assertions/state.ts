// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * State assertion - verify Live Set state via MCP tool calls
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText, parseToolResult } from "#evals/chat/mcp.ts";
import { getNotation, setConfig } from "#evals/shared/config.ts";
import { type Notation } from "#src/shared/notation.ts";
import {
  type StateAssertion,
  type EvalAssertionResult,
  type EvalTurnResult,
} from "../types.ts";
import { partialMatch } from "./helpers.ts";

/**
 * Assert Live Set state by calling an MCP tool and checking the result
 *
 * @param assertion - The state assertion to evaluate
 * @param turns - Completed conversation turns (for args derived from the run)
 * @param mcpClient - MCP client for tool calls
 * @returns Assertion result with pass/fail and details
 */
export async function assertState(
  assertion: StateAssertion,
  turns: EvalTurnResult[],
  mcpClient: Client,
): Promise<EvalAssertionResult> {
  // Snapshot the notation we override so the finally-block can restore the
  // prior value (e.g. a scenario's configured notation), not a hardcoded
  // default. Stays null when we never flip, so finally is a no-op then.
  let priorNotation: Notation | null = null;

  try {
    // Optionally flip the server notation before reading so the tool serializes
    // notes in a known format (grading reads clean midi-json regardless of the
    // notation the model wrote in). POST /config merges, so only notation
    // changes. Snapshot first so the exact prior notation is restored below.
    if (assertion.notation) {
      priorNotation = await getNotation();
      await setConfig({ notation: assertion.notation });
    }

    const args =
      typeof assertion.args === "function"
        ? assertion.args(turns)
        : assertion.args;

    const result = await mcpClient.callTool({
      name: assertion.tool,
      arguments: args,
    });

    const resultText = extractToolResultText(result);
    let parsed: unknown;

    try {
      parsed = parseToolResult(resultText);
    } catch {
      parsed = resultText;
    }

    const passed =
      typeof assertion.expect === "function"
        ? assertion.expect(parsed)
        : partialMatch(parsed as Record<string, unknown>, assertion.expect);

    // On failure, let a custom matcher explain WHAT diverged (e.g. a midi-json
    // note diff) instead of leaving a bare "(custom function)" in the report.
    const diff =
      !passed && assertion.explain ? assertion.explain(parsed) : undefined;
    const diffSuffix = diff ? `\n${diff}` : "";

    return {
      assertion,
      earned: passed ? 1 : 0,
      maxScore: 1,
      message: passed
        ? `State assertion passed for ${assertion.tool}`
        : `State assertion failed for ${assertion.tool}${diffSuffix}`,
      details: {
        actual: parsed,
        expected:
          typeof assertion.expect === "function"
            ? "(custom function)"
            : assertion.expect,
        ...(diff == null ? {} : { diff }),
      },
    };
  } catch (error) {
    return {
      assertion,
      earned: 0,
      maxScore: 1,
      message: `State assertion error: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
    };
  } finally {
    // Restore the prior notation so this assertion's override can't leak into a
    // later state read (assertions must be independent). Restores the scenario's
    // configured notation, not a hardcoded default.
    if (priorNotation != null) {
      await setConfig({ notation: priorNotation });
    }
  }
}
