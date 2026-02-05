// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Shared utilities for MCP client operations.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_CLIENT_NAME = "producer-pal-chat-ui";
const MCP_CLIENT_VERSION = "1.0.0";

/** MCP tool definition from listTools() */
export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: unknown;
}

/**
 * Creates and connects an MCP client to the specified URL.
 * @param mcpUrl - URL of the MCP server
 * @returns Connected MCP client
 */
export async function createConnectedMcpClient(
  mcpUrl: string,
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  const client = new Client({
    name: MCP_CLIENT_NAME,
    version: MCP_CLIENT_VERSION,
  });

  await client.connect(transport);

  return client;
}

/**
 * Filters MCP tools based on enabled/disabled configuration.
 * @param tools - Array of MCP tool definitions
 * @param enabledTools - Map of tool names to enabled state (undefined = enabled)
 * @returns Filtered array of tools
 */
export function filterEnabledTools(
  tools: McpToolDefinition[],
  enabledTools?: Record<string, boolean>,
): McpToolDefinition[] {
  if (!enabledTools) return tools;

  return tools.filter((tool) => enabledTools[tool.name] !== false);
}
