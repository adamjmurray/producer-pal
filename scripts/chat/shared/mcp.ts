import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Convert MCP tools to OpenAI function format for Responses API
 *
 * @param client - MCP client
 * @returns OpenAI-formatted tool definitions
 */
export async function getMcpToolsForOpenAI(
  client: Client,
): Promise<OpenAITool[]> {
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
