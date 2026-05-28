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
import { callMcpToolToString } from "#webui/hooks/voice/voice-mcp-call";

/** Result of creating Realtime SDK tools from MCP */
export interface RealtimeMcpTools {
  tools: Tool[];
  mcpClient: Client;
}

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
      execute: async (args: unknown) =>
        await callMcpToolToString(
          mcpClient,
          t.name,
          (args ?? {}) as Record<string, unknown>,
        ),
    }),
  );

  return { tools, mcpClient };
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
