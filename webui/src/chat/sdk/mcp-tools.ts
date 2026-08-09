// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type ToolSet, jsonSchema } from "ai";
import { type Notation } from "#src/shared/notation";
import {
  createConnectedMcpClient,
  filterEnabledTools,
} from "#webui/chat/helpers/mcp-client-helpers";
import { extractMcpText } from "#webui/lib/utils/mcp-content";

/** Result of creating AI SDK tools from MCP */
export interface McpTools {
  tools: ToolSet;
  mcpClient: Client;
}

/**
 * Creates AI SDK-compatible tools from an MCP server connection.
 * Each tool's execute function delegates to mcpClient.callTool().
 * @param mcpUrl - URL of the MCP server
 * @param enabledTools - Map of tool names to enabled state. Sent to the server
 *   as the disabled-tools header (so it withholds those tools AND their skills
 *   fragments) and applied again to the returned list, which also drops names
 *   the server doesn't know about.
 * @param smallModelMode - Per-request small-model mode carried on every MCP
 *   request (shrinks tool schemas + selects the basic skills variant); omit for
 *   the global default
 * @param notation - Per-request notation carried on every MCP request (selects
 *   the skills variant AND how the server parses/formats clip notes); omit for
 *   the global default
 * @returns AI SDK tools and the underlying MCP client
 */
export async function createMcpTools(
  mcpUrl: string,
  enabledTools?: Record<string, boolean>,
  smallModelMode?: boolean,
  notation?: Notation,
): Promise<McpTools> {
  const mcpClient = await createConnectedMcpClient(
    mcpUrl,
    smallModelMode,
    enabledTools,
    notation,
  );
  // Close the connection ourselves if the catalog read fails. The caller only
  // learns of the client through a successful return, so a throw here would
  // strand an open transport (a held-open SSE stream) that nothing can reach.
  let filtered;

  try {
    const toolsResult = await mcpClient.listTools();

    filtered = filterEnabledTools(toolsResult.tools, enabledTools);
  } catch (error) {
    await mcpClient.close().catch(() => {});
    throw error;
  }

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

        if (result.isError) {
          // Content is always the array form for error responses
          const content = result.content as Array<{
            type: string;
            text?: string;
          }>;

          throw new Error(extractMcpText(content));
        }

        return result.content;
      },
    };
  }

  return { tools, mcpClient };
}
