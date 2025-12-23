import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ChatTool } from "./types.ts";

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
  const transport = new StreamableHTTPClientTransport(url);
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

// Aliases for backward compatibility and different API styles
export const getMcpToolsForOpenAI = getMcpToolsForChat;
export const getMcpToolsForResponses = getMcpToolsForChat;

/**
 * Extract text content from an MCP tool call result
 *
 * @param result - The result from an MCP callTool invocation
 * @returns The text content from the first content item, or empty string
 */
export function extractToolResultText(
  result: Awaited<ReturnType<Client["callTool"]>>,
): string {
  const content = result.content as Array<{ text?: string }> | undefined;

  return content?.[0]?.text ?? "";
}
