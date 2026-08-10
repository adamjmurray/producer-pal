// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The one step every MCP → SDK tool bridge starts with: connect, read the
// catalog, and don't strand the transport if the catalog read fails. Three
// bridges (chat, OpenAI Realtime, Gemini Live) share it, and it lives here rather
// than in mcp-client-helpers.ts so their tests can keep mocking the connect —
// a mock never intercepts a call made through a same-module binding.

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type Notation } from "#src/shared/notation";
import {
  type McpToolDefinition,
  createConnectedMcpClient,
  filterEnabledTools,
} from "#webui/chat/helpers/mcp-client-helpers";

/** A connected MCP client plus the filtered tool catalog it reported. */
export interface McpConnection {
  mcpClient: Client;
  tools: McpToolDefinition[];
}

/**
 * Connect to an MCP server and read its filtered tool catalog.
 *
 * Closes the connection itself if the catalog read fails: a caller only learns of
 * the client through a successful return, so a throw here would strand an open
 * transport (a held-open SSE stream) that nothing can reach — and strand another
 * one on every retry.
 *
 * @param mcpUrl - URL of the MCP server
 * @param smallModelMode - Per-request small-model mode; omit to use the global
 * @param enabledTools - Map of tool name to enabled state (absent = enabled)
 * @param notation - Per-request notation; omit to use the global setting
 * @returns The connected client and the tools it offers, after filtering
 */
export async function connectAndListTools(
  mcpUrl: string,
  smallModelMode?: boolean,
  enabledTools?: Record<string, boolean>,
  notation?: Notation,
): Promise<McpConnection> {
  const mcpClient = await createConnectedMcpClient(
    mcpUrl,
    smallModelMode,
    enabledTools,
    notation,
  );

  try {
    const toolsResult = await mcpClient.listTools();

    return {
      mcpClient,
      tools: filterEnabledTools(toolsResult.tools, enabledTools),
    };
  } catch (error) {
    await mcpClient.close().catch(() => {});
    throw error;
  }
}
