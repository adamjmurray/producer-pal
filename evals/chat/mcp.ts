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
import { MCP_URL } from "#evals/shared/mcp-url.ts";
import { parseCompactJSLiteral } from "#src/shared/compact/compact-parser.ts";
import { mcpResultText } from "./shared/mcp-result-text.ts";

const MCP_CLIENT_NAME = "producer-pal-chat";
const MCP_CLIENT_VERSION = "1.0.0";

/** MCP connection with client and transport */
export interface McpConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

/** Result of creating AI SDK tools from MCP */
export interface McpTools {
  tools: ToolSet;
  mcpClient: Client;
  /**
   * Ids of the tool calls whose MCP result came back with `isError: true`.
   *
   * Out of band because `execute` has to keep returning `result.content`
   * unchanged — that value is serialized into the model's context, so folding
   * the flag into it would shift every eval score.
   */
  erroredToolCallIds: Set<string>;
}

/** Options for {@link connectMcp} */
export interface ConnectMcpOptions {
  /**
   * Extra HTTP headers sent on every request this connection makes. The point
   * is the per-request `x-producer-pal-*` headers (disabled tools, small-model
   * mode, notation): they are scoped to one caller, so proving that takes a
   * second connection carrying different ones.
   */
  headers?: Record<string, string>;
}

/**
 * Connect to an MCP server (raw connection without AI SDK tools).
 * Used by e2e tests and eval assertions that need direct MCP access.
 *
 * @param url - MCP server URL
 * @param options - Connection options ({@link ConnectMcpOptions})
 * @param options.headers - Extra HTTP headers for every request
 * @returns MCP connection with client and transport
 */
export async function connectMcp(
  url: string = MCP_URL,
  { headers }: ConnectMcpOptions = {},
): Promise<McpConnection> {
  const transport = new StreamableHTTPClientTransport(
    new URL(url),
    headers ? { requestInit: { headers } } : undefined,
  );
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
 * @returns AI SDK tools, the underlying MCP client, and the errored-call id set
 */
export async function createMcpTools(url: string = MCP_URL): Promise<McpTools> {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const mcpClient = new Client({
    name: MCP_CLIENT_NAME,
    version: MCP_CLIENT_VERSION,
  });

  await mcpClient.connect(transport);

  const toolsResult = await mcpClient.listTools();
  const tools: ToolSet = {};
  const erroredToolCallIds = new Set<string>();

  for (const t of toolsResult.tools) {
    tools[t.name] = {
      description: t.description,
      inputSchema: jsonSchema(
        t.inputSchema as Parameters<typeof jsonSchema>[0],
      ),
      execute: async (
        args: Record<string, unknown>,
        // The AI SDK's ToolExecutionOptions; only the id is needed here.
        { toolCallId }: { toolCallId: string },
      ) => {
        const result = await mcpClient.callTool({
          name: t.name,
          arguments: args,
        });

        if (result.isError === true) erroredToolCallIds.add(toolCallId);

        // Unchanged on purpose: this is what the model sees.
        return result.content;
      },
    };
  }

  return { tools, mcpClient, erroredToolCallIds };
}

/**
 * Extract text content from an MCP tool call result
 *
 * The payload only — relayed `WARNING:` blocks sit in the content items after
 * it and are read with `mcpResultWarnings`. Keeping them out is what lets
 * callers hand this straight to `parseToolResult`.
 *
 * @param result - The result from an MCP callTool invocation
 * @returns The text content from the first content item, or empty string
 */
export function extractToolResultText(result: unknown): string {
  return mcpResultText(result);
}

/**
 * Parse an MCP tool-result string that may be JSON (the `json-on` profile / MCP
 * Inspector) OR the server's default compact JS-literal format. Tries native
 * JSON first, then the compact parser. Throws if the text is neither — callers
 * that want a graceful fallback should wrap this in try/catch.
 *
 * @param text - The tool result text (e.g. from extractToolResultText)
 * @returns The parsed value
 */
export function parseToolResult(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return parseCompactJSLiteral(text);
  }
}
