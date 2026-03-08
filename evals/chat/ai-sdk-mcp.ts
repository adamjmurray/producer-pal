// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * MCP tool bridge for AI SDK.
 * Connects to MCP server and creates AI SDK ToolSet from available tools.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type ToolSet, jsonSchema } from "ai";

const DEFAULT_MCP_URL = "http://localhost:3350/mcp";
const MCP_CLIENT_NAME = "producer-pal-chat";
const MCP_CLIENT_VERSION = "1.0.0";

/** MCP connection with client and transport */
export interface McpConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

/** Result of creating AI SDK tools from MCP */
export interface AiSdkMcpTools {
  tools: ToolSet;
  mcpClient: Client;
}

/**
 * Connect to an MCP server (raw connection without AI SDK tools).
 * Used by e2e tests and eval assertions that need direct MCP access.
 *
 * @param url - MCP server URL
 * @returns MCP connection with client and transport
 */
export async function connectMcp(
  url: string = DEFAULT_MCP_URL,
): Promise<McpConnection> {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({
    name: MCP_CLIENT_NAME,
    version: MCP_CLIENT_VERSION,
  });

  await client.connect(transport);

  return { client, transport };
}

/**
 * Create AI SDK-compatible tools from an MCP server connection.
 * Each tool's execute function delegates to mcpClient.callTool().
 *
 * @param url - MCP server URL
 * @returns AI SDK tools and the underlying MCP client
 */
export async function createAiSdkMcpTools(
  url: string = DEFAULT_MCP_URL,
): Promise<AiSdkMcpTools> {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const mcpClient = new Client({
    name: MCP_CLIENT_NAME,
    version: MCP_CLIENT_VERSION,
  });

  await mcpClient.connect(transport);

  const toolsResult = await mcpClient.listTools();
  const tools: ToolSet = {};

  for (const t of toolsResult.tools) {
    tools[t.name] = {
      description: t.description,
      inputSchema: jsonSchema(
        t.inputSchema as Parameters<typeof jsonSchema>[0],
      ),
      execute: async (args: Record<string, unknown>) => {
        const result = await mcpClient.callTool({
          name: t.name,
          arguments: args,
        });

        return result.content;
      },
    };
  }

  return { tools, mcpClient };
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
