/**
 * Shared tool execution utilities for chat providers
 */
import { formatToolCall, formatToolResult } from "./formatting.ts";
import { extractToolResultText } from "./mcp.ts";
import type { TurnResult } from "./types.ts";

export type McpClient = {
  callTool: (params: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<unknown>;
};

export interface ToolExecutionResult {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

/**
 * Executes a tool call via MCP and logs the result
 *
 * @param mcpClient - MCP client to execute the call
 * @param name - Tool name to call
 * @param args - Tool arguments
 * @returns Tool execution result with name, args, and result text
 */
export async function executeAndLogToolCall(
  mcpClient: McpClient,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  console.log(formatToolCall(name, args));

  const result = await mcpClient.callTool({ name, arguments: args });
  const resultText = extractToolResultText(result);

  console.log(formatToolResult(resultText));

  return { name, args, result: resultText };
}

/**
 * Parses JSON arguments safely, returning empty object on parse failure
 *
 * @param argsJson - JSON string to parse
 * @returns Parsed arguments object
 */
export function parseToolArgs(argsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Executes a tool call with error handling
 *
 * @param mcpClient - MCP client to execute the call
 * @param name - Tool name to call
 * @param args - Tool arguments
 * @returns Tool execution result, with error message in result if call fails
 */
export async function executeToolCallSafe(
  mcpClient: McpClient,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  console.log(formatToolCall(name, args));

  try {
    const result = await mcpClient.callTool({ name, arguments: args });
    const resultText = extractToolResultText(result);

    console.log(formatToolResult(resultText));

    return { name, args, result: resultText };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.log(formatToolResult(`Error: ${errorMsg}`));

    return { name, args, result: `Error: ${errorMsg}` };
  }
}

/**
 * Type guard to check if tool calls array is non-empty
 *
 * @param toolCalls - Array of tool calls to check
 * @returns True if array has items
 */
export function hasToolCalls(
  toolCalls: TurnResult["toolCalls"],
): toolCalls is [TurnResult["toolCalls"][number], ...TurnResult["toolCalls"]] {
  return toolCalls.length > 0;
}
