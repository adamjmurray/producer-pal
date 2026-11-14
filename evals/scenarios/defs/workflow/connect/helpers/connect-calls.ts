// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Reading the upgrade scenarios' tool calls: which `ppal-connect` calls were a
 * version check, and which `ppal-manage` action ran.
 */

import { TOOLS } from "#evals/shared/tool-names.ts";
import { type EvalTurnResult, type ToolCall } from "../../../../types.ts";

/**
 * @param call - A tool call
 * @returns True for `ppal-connect` with `versionCheck: true`
 */
export function isVersionCheck(call: ToolCall): boolean {
  return call.name === TOOLS.connect && call.args.versionCheck === true;
}

/**
 * @param call - A tool call
 * @returns True for a `ppal-connect` that is not a version check
 */
export function isFullConnect(call: ToolCall): boolean {
  return call.name === TOOLS.connect && call.args.versionCheck !== true;
}

/**
 * @param action - The `ppal-manage` action
 * @returns A test for a call to that action
 */
export function isManage(action: string): (call: ToolCall) => boolean {
  return (call) => call.name === TOOLS.manage && call.args.action === action;
}

/**
 * @param turns - All turns
 * @param from - The first turn to read
 * @returns Every call from that turn on, in order, failed attempts included
 */
export function callsFrom(turns: EvalTurnResult[], from: number): ToolCall[] {
  return turns.slice(from).flatMap((turn) => turn.toolCalls);
}
