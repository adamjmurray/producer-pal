import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Creates and initializes an MCP server with tools
 * @returns {Promise<McpServer>} Initialized MCP server
 */
export async function createMcpServer() {
  const server = new McpServer(
    {
      name: 'browser-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register UUID generator tool
  server.registerTool(
    'generate_uuid',
    {
      description: 'Generates a random UUID (v4)',
      inputSchema: {},
    },
    async () => {
      const uuid = crypto.randomUUID();
      return {
        content: [
          {
            type: 'text',
            text: uuid,
          },
        ],
      };
    }
  );

  return server;
}

/**
 * Creates and initializes an MCP client
 * @returns {Promise<Client>} Initialized MCP client
 */
export async function createMcpClient() {
  const client = new Client(
    {
      name: 'browser-mcp-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  return client;
}

/**
 * Creates a connected MCP server-client pair for in-browser use
 * @returns {Promise<object>} Connected server and client pair
 */
export async function createConnectedMcpPair() {
  // Create server and client
  const server = await createMcpServer();
  const client = await createMcpClient();

  // Create linked in-memory transports
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  // Connect server and client to their respective transports
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { server, client };
}
