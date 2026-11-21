// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  getToolErrorMessage,
  type McpTestContext,
  parseToolResult,
} from "../../../mcp-test-helpers";

/**
 * Call a tool and parse its result.
 * @param ctx - The test context
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns The parsed result
 */
export async function callParsed<T>(
  ctx: McpTestContext,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  return parseToolResult<T>(
    await ctx.client!.callTool({ name, arguments: args }),
  );
}

/**
 * Call a tool that is refused and return what it said.
 * @param ctx - The test context
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns The error message
 */
export async function callRefused(
  ctx: McpTestContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  return getToolErrorMessage(
    await ctx.client!.callTool({ name, arguments: args }),
  );
}
