// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { getToolCalls } from "../../../../assertions/index.ts";
import { type EvalTurnResult, type ToolCall } from "../../../../types.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/**
 * The update-device calls that asked for a macro count and were answered.
 *
 * @param turns - All conversation turns
 * @param count - The macro count asked for
 * @returns The successful calls whose `macroCount` is that count
 */
export function macroCountRequests(
  turns: EvalTurnResult[],
  count: number,
): ToolCall[] {
  return getToolCalls(turns).filter(
    (call) =>
      call.name === TOOLS.updateDevice &&
      Number(call.args.macroCount) === count,
  );
}
