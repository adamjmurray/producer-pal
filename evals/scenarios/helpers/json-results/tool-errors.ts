// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Tally the tool calls that came back as errors.
 */

import { TOOL_NAME_PREFIX } from "#src/shared/tool-groups.ts";
import { toolCallFailed } from "../../assertions/index.ts";
import {
  type EvalTurnResult,
  type ExpectedRefusal,
  type ToolCall,
} from "../../types.ts";
import { type JsonToolErrors } from "./types.ts";

/** Error text is only there to identify the failure — keep it short. */
const MESSAGE_LIMIT = 200;

/**
 * Count the failed Producer Pal tool calls across a run and describe each one.
 * Calls to a transport's own tools (Codex's `list_mcp_resources`) stay in the
 * transcript only. Every transport reports our tool names bare.
 *
 * A model that hits an error, fixes its arguments and calls again still lands
 * the outcome, so this never decides pass/fail — it feeds the score penalty
 * (see `scorePercentage`) so a clean run outranks a recovered one.
 *
 * A failed call that matches one of the scenario's expected refusals is left
 * out of `count` and `errors`.
 *
 * @param turns - Completed conversation turns
 * @param expectedRefusals - Refusals the scenario provokes on purpose
 * @returns The tally, or undefined when the run made no Producer Pal calls
 */
export function collectToolErrors(
  turns: EvalTurnResult[],
  expectedRefusals: ExpectedRefusal[] = [],
): JsonToolErrors | undefined {
  const errors: JsonToolErrors["errors"] = [];
  let madeCall = false;

  for (const turn of turns) {
    for (const call of turn.toolCalls) {
      if (!call.name.startsWith(TOOL_NAME_PREFIX)) {
        continue;
      }

      madeCall = true;

      if (!toolCallFailed(call) || isExpectedRefusal(call, expectedRefusals)) {
        continue;
      }

      errors.push({
        turnIndex: turn.turnIndex,
        name: call.name,
        message: (call.result ?? "").slice(0, MESSAGE_LIMIT),
      });
    }
  }

  if (!madeCall) {
    return undefined;
  }

  return { count: errors.length, errors };
}

/**
 * Count the Producer Pal tool calls a run made, failed ones included. A
 * transport's own tools are left out, as in `collectToolErrors`.
 *
 * @param turns - Turns, live or as saved in a result file
 * @returns How many Producer Pal calls the turns hold
 */
export function countToolCalls(
  turns: Array<{ toolCalls: Array<{ name: string }> }>,
): number {
  return turns
    .flatMap((turn) => turn.toolCalls)
    .filter((call) => call.name.startsWith(TOOL_NAME_PREFIX)).length;
}

function isExpectedRefusal(
  call: ToolCall,
  expectedRefusals: ExpectedRefusal[],
): boolean {
  const text = call.result ?? "";

  return expectedRefusals.some(
    ({ tool, message }) =>
      tool === call.name &&
      (typeof message === "string"
        ? text.includes(message)
        : message.test(text)),
  );
}
