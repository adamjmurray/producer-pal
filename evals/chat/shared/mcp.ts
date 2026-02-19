// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  type AnthropicTool,
  type ChatTool,
  type ResponsesTool,
} from "./types.ts";

const DEFAULT_MCP_URL = "http://localhost:3350/mcp";

export interface McpConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

/**
 * Connect to an MCP server
 *
 * @param url - MCP server URL
 * @returns MCP connection with client and transport
 */
export async function connectMcp(
  url: string = DEFAULT_MCP_URL,
): Promise<McpConnection> {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({
    name: "producer-pal-chat",
    version: "1.0.0",
  });

  await client.connect(transport);

  return { client, transport };
}

// Re-export ChatTool for convenience
export type { ChatTool };

// Alias for backward compatibility with OpenAI Responses API code
export type OpenAITool = ChatTool;

/**
 * Convert MCP tools to OpenAI/OpenRouter Chat API function format
 *
 * @param client - MCP client
 * @returns Chat API formatted tool definitions
 */
export async function getMcpToolsForChat(client: Client): Promise<ChatTool[]> {
  const { tools } = await client.listTools();

  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema as Record<string, unknown>,
    },
  }));
}

// Aliases for different API styles
export const getMcpToolsForOpenRouter = getMcpToolsForChat;

// Re-export ResponsesTool for convenience
export type { ResponsesTool };

/**
 * Convert MCP tools to OpenAI Responses API function format
 *
 * The Responses API uses a flat format where name, description, and parameters
 * are at the same level as type, not nested under "function".
 *
 * @param client - MCP client
 * @returns Responses API formatted tool definitions
 */
export async function getMcpToolsForOpenAI(
  client: Client,
): Promise<ResponsesTool[]> {
  const { tools } = await client.listTools();

  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description ?? "",
    parameters: tool.inputSchema as Record<string, unknown>,
  }));
}

// Alias for OpenRouter Responses API (uses same flat format as OpenAI Responses)
export const getMcpToolsForResponses = getMcpToolsForOpenAI;

// Re-export AnthropicTool for convenience
export type { AnthropicTool };

/**
 * Convert MCP tools to Anthropic Messages API format
 *
 * @param client - MCP client
 * @returns Anthropic formatted tool definitions
 */
export async function getMcpToolsForAnthropic(
  client: Client,
): Promise<AnthropicTool[]> {
  const { tools } = await client.listTools();

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    input_schema: tool.inputSchema as AnthropicTool["input_schema"],
  }));
}

/**
 * Extract text content from an MCP tool call result
 *
 * @param result - The result from an MCP callTool invocation
 * @returns The text content from the first content item, or empty string
 */
export function extractToolResultText(result: unknown): string {
  const typed = result as { content?: Array<{ text?: string }> } | null;

  return typed?.content?.[0]?.text ?? "";
}
