// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared Anthropic tool handling utilities
 */

import {
  type ContentBlock,
  type MessageParam,
  type Tool,
  type ToolResultBlockParam,
  type ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { isQuietMode } from "#evals/scenarios/helpers/output-config.ts";
import { truncate } from "../shared/formatting.ts";
import { extractToolResultText } from "../shared/mcp.ts";
import { type TurnResult } from "../shared/types.ts";

/** MCP tool format returned by getMcpToolsForAnthropic */
export interface McpAnthropicTool {
  name: string;
  description: string;
  input_schema: Tool["input_schema"];
}

/**
 * Convert MCP tools to Anthropic Tool format
 *
 * @param mcpTools - Tools from getMcpToolsForAnthropic
 * @returns Anthropic-compatible tools array
 */
export function convertMcpToolsToAnthropic(
  mcpTools: McpAnthropicTool[],
): Tool[] {
  return mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
}

/**
 * Execute tool calls and return results for Anthropic
 *
 * @param toolUseBlocks - Tool use blocks from the response
 * @param mcpClient - MCP client for tool execution
 * @param allToolCalls - Array to track all tool calls (mutated with results)
 * @returns Tool result blocks to send back to Anthropic
 */
export async function executeAnthropicToolCalls(
  toolUseBlocks: ToolUseBlock[],
  mcpClient: Client,
  allToolCalls: TurnResult["toolCalls"],
): Promise<ToolResultBlockParam[]> {
  const toolResults: ToolResultBlockParam[] = [];

  for (const toolUse of toolUseBlocks) {
    const result = await mcpClient.callTool({
      name: toolUse.name,
      arguments: toolUse.input as Record<string, unknown>,
    });
    const resultText = extractToolResultText(result);

    toolResults.push({
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: resultText,
    });

    // Update tool call result in our tracking
    const tracked = allToolCalls.find(
      (tc) =>
        tc.name === toolUse.name &&
        JSON.stringify(tc.args) === JSON.stringify(toolUse.input),
    );

    if (tracked) tracked.result = resultText;

    if (!isQuietMode()) console.log(`   \u21b3 ${truncate(resultText, 160)}`);
  }

  return toolResults;
}

/** Result of processing tool calls from a response */
export interface ProcessToolCallsResult {
  /** Whether there were tool calls to process (and loop should continue) */
  hasToolCalls: boolean;
}

/**
 * Process tool calls from an Anthropic response
 *
 * Extracts tool_use blocks from the response, executes them via MCP,
 * and updates the message history. Returns whether the tool loop should continue.
 *
 * @param responseContent - Content blocks from the Anthropic response
 * @param mcpClient - MCP client for tool execution
 * @param messages - Message history to update (mutated)
 * @param allToolCalls - Array to track all tool calls (mutated with results)
 * @returns Result indicating whether tool calls were processed
 */
export async function processAnthropicToolCalls(
  responseContent: ContentBlock[],
  mcpClient: Client,
  messages: MessageParam[],
  allToolCalls: TurnResult["toolCalls"],
): Promise<ProcessToolCallsResult> {
  // Check for tool_use blocks
  const toolUseBlocks = responseContent.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  );

  if (toolUseBlocks.length === 0) {
    return { hasToolCalls: false };
  }

  // Add assistant message with tool_use blocks to history
  messages.push({ role: "assistant", content: responseContent });

  // Execute tools and collect results
  const toolResults = await executeAnthropicToolCalls(
    toolUseBlocks,
    mcpClient,
    allToolCalls,
  );

  // Add tool results as user message
  messages.push({ role: "user", content: toolResults });

  if (!isQuietMode()) console.log();

  return { hasToolCalls: true };
}
