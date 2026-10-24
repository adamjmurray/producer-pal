// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import { STANDARD_TOOL_DEFS } from "../../create-mcp-server.ts";

type ChangesSet = (args: Record<string, unknown>) => boolean;

/**
 * Tools that aren't read-only, read off their defs, each with the check that
 * says whether a given call can change the Set.
 */
const WRITE_TOOLS: ReadonlyMap<string, ChangesSet> = new Map(
  [...STANDARD_TOOL_DEFS, toolDefLiveApi]
    .filter((def) => def.toolOptions.annotations?.readOnlyHint !== true)
    .map((def): [string, ChangesSet] => [
      def.toolName,
      def.toolOptions.changesSet ?? (() => true),
    ]),
);

/**
 * Whether a tool call can change the Live Set. Unknown tools can't: V8 refuses
 * them before touching anything.
 *
 * @param tool - Tool name
 * @param args - The call's arguments
 * @returns True for a call to a write tool that may change the Set
 */
export function isWriteCall(tool: string, args: object): boolean {
  return WRITE_TOOLS.get(tool)?.(args as Record<string, unknown>) ?? false;
}
