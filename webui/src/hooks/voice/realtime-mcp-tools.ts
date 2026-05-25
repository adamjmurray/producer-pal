// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type Tool } from "@openai/agents";
import { tool } from "@openai/agents/realtime";
import {
  createConnectedMcpClient,
  filterEnabledTools,
} from "#webui/chat/helpers/mcp-client-helpers";

/** Result of creating Realtime SDK tools from MCP */
export interface RealtimeMcpTools {
  tools: Tool[];
  mcpClient: Client;
}

// Cap how long a voice tool call can run. The MCP SDK's default is 60s; a stuck
// Live operation would otherwise block the voice turn that long with no
// feedback. On timeout the SDK rejects with an McpError, which is caught below
// and returned to the model as a normal tool-error string so it can recover.
const VOICE_TOOL_TIMEOUT_MS = 30_000;

/**
 * Build OpenAI Realtime SDK tools from a Producer Pal MCP server. Each tool's
 * execute() forwards to mcpClient.callTool(), so the voice agent reaches Live
 * through the same JSON-RPC endpoint the chat UI already uses.
 *
 * @param mcpUrl - URL of the MCP server
 * @param enabledTools - Optional map of tool names to enabled state
 * @returns Realtime tools + the underlying MCP client (caller closes it)
 */
export async function createRealtimeMcpTools(
  mcpUrl: string,
  enabledTools?: Record<string, boolean>,
): Promise<RealtimeMcpTools> {
  const mcpClient = await createConnectedMcpClient(mcpUrl);
  const toolsResult = await mcpClient.listTools();
  const filtered = filterEnabledTools(toolsResult.tools, enabledTools);

  const tools: Tool[] = filtered.map((t) =>
    tool({
      name: t.name,
      description: t.description ?? "",
      // MCP returns JSON Schema; the Realtime SDK accepts JSON Schema directly
      // when strict mode is disabled. We disable strict mode because MCP tool
      // schemas use features (defaults, optionals, additionalProperties) that
      // OpenAI's strict-mode JSON schema does not accept.
      parameters: normalizeJsonSchema(t.inputSchema),
      strict: false,
      execute: async (args: unknown) => {
        try {
          const result = await mcpClient.callTool(
            {
              name: t.name,
              arguments: args as Record<string, unknown>,
            },
            undefined,
            { timeout: VOICE_TOOL_TIMEOUT_MS },
          );

          const content = result.content as Array<{
            type: string;
            text?: string;
          }>;

          const text = extractMcpText(content);

          // Return MCP errors as a normal tool output (prefixed) instead of
          // throwing. The Realtime SDK's default error-handling can leave the
          // voice session in a broken state — returning the error text as the
          // function output lets the model see it and respond naturally.
          if (result.isError) {
            return `Error from ${t.name}: ${text}`;
          }

          return text;
        } catch (err) {
          // Same rationale for transport/network errors raised by the MCP client.
          const message = err instanceof Error ? err.message : String(err);

          return `Error calling ${t.name}: ${message}`;
        }
      },
    }),
  );

  return { tools, mcpClient };
}

/**
 * Extract text content from an MCP content array.
 *
 * @param content - MCP content items (text, image, etc.)
 * @returns Concatenated text from all text content items
 */
function extractMcpText(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

type JsonObjectSchemaNonStrict = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: true;
  description?: string;
};

/**
 * Coerce an MCP-returned input schema into the JsonObjectSchemaNonStrict
 * shape the Realtime SDK expects. MCP schemas already have `type: "object"`
 * and `properties`; we just ensure `required` and `additionalProperties: true`
 * are present.
 *
 * @param raw - The raw inputSchema from MCP listTools()
 * @returns A JsonObjectSchemaNonStrict the SDK will accept
 */
function normalizeJsonSchema(raw: unknown): JsonObjectSchemaNonStrict {
  const schema = (raw ?? {}) as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: unknown;
    description?: string;
  };

  return {
    type: "object",
    properties: schema.properties ?? {},
    required: Array.isArray(schema.required)
      ? (schema.required as string[])
      : [],
    additionalProperties: true,
    description: schema.description,
  };
}
