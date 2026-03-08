// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * State assertion - verify Live Set state via MCP tool calls
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText } from "#evals/chat/ai-sdk-mcp.ts";
import { type StateAssertion, type EvalAssertionResult } from "../types.ts";
import { partialMatch } from "./helpers.ts";

/**
 * Assert Live Set state by calling an MCP tool and checking the result
 *
 * @param assertion - The state assertion to evaluate
 * @param mcpClient - MCP client for tool calls
 * @returns Assertion result with pass/fail and details
 */
export async function assertState(
  assertion: StateAssertion,
  mcpClient: Client,
): Promise<EvalAssertionResult> {
  try {
    const result = await mcpClient.callTool({
      name: assertion.tool,
      arguments: assertion.args,
    });

    const resultText = extractToolResultText(result);
    let parsed: unknown;

    try {
      parsed = JSON.parse(resultText);
    } catch {
      parsed = resultText;
    }

    const passed =
      typeof assertion.expect === "function"
        ? assertion.expect(parsed)
        : partialMatch(parsed as Record<string, unknown>, assertion.expect);

    const maxScore = assertion.score ?? 1;

    return {
      assertion,
      earned: passed ? maxScore : 0,
      maxScore,
      message: passed
        ? `State assertion passed for ${assertion.tool}`
        : `State assertion failed for ${assertion.tool}`,
      details: {
        actual: parsed,
        expected:
          typeof assertion.expect === "function"
            ? "(custom function)"
            : assertion.expect,
      },
    };
  } catch (error) {
    const maxScore = assertion.score ?? 1;

    return {
      assertion,
      earned: 0,
      maxScore,
      message: `State assertion error: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
    };
  }
}
