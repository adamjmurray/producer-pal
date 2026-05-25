// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type FunctionDeclaration } from "@google/genai";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createConnectedMcpClient,
  filterEnabledTools,
} from "#webui/chat/helpers/mcp-client-helpers";
import { callMcpToolToString } from "#webui/hooks/voice/voice-mcp-call";

/** Result of creating Gemini Live function declarations from MCP. */
export interface GeminiMcpTools {
  /** Declarations for the Live session config (config.tools). */
  functionDeclarations: FunctionDeclaration[];
  /** Run a tool the model called, by name, returning a string for the
   * functionResponse output (errors come back as a prefixed string, never a
   * throw — same recovery policy as the OpenAI bridge). */
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** The underlying MCP client (caller closes it). */
  mcpClient: Client;
}

/**
 * Build Gemini Live function declarations from a Producer Pal MCP server. Unlike
 * OpenAI's SDK (which wraps each tool with its own execute()), Gemini hands back
 * a `toolCall` with the tool name and we dispatch it ourselves — so this returns
 * the declarations plus one executeTool(name, args) dispatcher over the same MCP
 * client the chat UI uses. MCP tool names (with dashes) are valid Gemini
 * function names, so no name mangling is needed.
 *
 * @param mcpUrl - URL of the MCP server
 * @param enabledTools - Optional map of tool names to enabled state
 * @returns Function declarations, the dispatcher, and the MCP client
 */
export async function createGeminiMcpTools(
  mcpUrl: string,
  enabledTools?: Record<string, boolean>,
): Promise<GeminiMcpTools> {
  const mcpClient = await createConnectedMcpClient(mcpUrl);
  const toolsResult = await mcpClient.listTools();
  const filtered = filterEnabledTools(toolsResult.tools, enabledTools);

  const functionDeclarations: FunctionDeclaration[] = filtered.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    parametersJsonSchema: normalizeGeminiSchema(t.inputSchema),
  }));

  const executeTool = (
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> => callMcpToolToString(mcpClient, name, args);

  return { functionDeclarations, executeTool, mcpClient };
}

/**
 * Coerce an MCP input schema into the JSON Schema object Gemini's
 * parametersJsonSchema expects: an object schema with properties. Passes the
 * MCP schema through (preserving enums, nested objects, descriptions) but drops
 * `$schema` (a meta-key Gemini's validator doesn't need) and guarantees
 * type/properties/required defaults for a bare schema.
 *
 * @param raw - The raw inputSchema from MCP listTools()
 * @returns A JSON Schema object for parametersJsonSchema
 */
function normalizeGeminiSchema(raw: unknown): Record<string, unknown> {
  const schema = { ...((raw ?? {}) as Record<string, unknown>) };

  delete schema.$schema;

  return {
    type: "object",
    properties: {},
    required: [],
    ...schema,
  };
}
