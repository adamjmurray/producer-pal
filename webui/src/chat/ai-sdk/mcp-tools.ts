// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type ToolSet, jsonSchema } from "ai";
import {
  createConnectedMcpClient,
  filterEnabledTools,
} from "#webui/chat/helpers/mcp-client-helpers";

/** Result of creating AI SDK tools from MCP */
export interface AiSdkMcpTools {
  tools: ToolSet;
  mcpClient: Client;
}

/**
 * Creates AI SDK-compatible tools from an MCP server connection.
 * Each tool's execute function delegates to mcpClient.callTool().
 * @param mcpUrl - URL of the MCP server
 * @param enabledTools - Map of tool names to enabled state
 * @returns AI SDK tools and the underlying MCP client
 */
export async function createAiSdkMcpTools(
  mcpUrl: string,
  enabledTools?: Record<string, boolean>,
): Promise<AiSdkMcpTools> {
  const mcpClient = await createConnectedMcpClient(mcpUrl);
  const toolsResult = await mcpClient.listTools();
  const filtered = filterEnabledTools(toolsResult.tools, enabledTools);

  const tools: ToolSet = {};

  for (const t of filtered) {
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
