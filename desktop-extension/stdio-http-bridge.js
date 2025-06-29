// desktop-extension/stdio-http-bridge.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Custom stdio-to-HTTP bridge for MCP communication
 * Replaces mcp-remote with our own implementation for full control
 * 
 * This bridge acts as an MCP server that accepts stdio connections from Claude Desktop
 * and forwards all tool calls to our HTTP MCP server
 */
export class StdioHttpBridge {
  constructor(httpUrl, options = {}) {
    this.httpUrl = httpUrl;
    this.options = options;
    this.mcpServer = null;
    this.httpClient = null;
    this.isConnected = false;
  }

  async start() {
    console.error(`[Bridge] Starting custom stdio-to-HTTP bridge`);
    console.error(`[Bridge] Target HTTP URL: ${this.httpUrl}`);

    try {
      // Create HTTP client to connect to our MCP server
      const httpTransport = new StreamableHTTPClientTransport(new URL(this.httpUrl));
      this.httpClient = new Client(
        {
          name: "stdio-http-bridge-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect to the HTTP server
      await this.httpClient.connect(httpTransport);
      console.error('[Bridge] Connected to HTTP MCP server');

      // Create MCP server that will handle stdio connections
      this.mcpServer = new Server(
        {
          name: "stdio-http-bridge",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      // Set up request handlers to forward to HTTP client
      this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
        console.error(`[Bridge] Forwarding tools/list to HTTP client`);
        const result = await this.httpClient.listTools();
        console.error(`[Bridge] tools/list response:`, JSON.stringify(result, null, 2));
        return result;
      });

      this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        console.error(`[Bridge] Tool call: ${request.params.name}`, request.params.arguments);
        
        try {
          // The Client.callTool expects a different parameter format
          // Convert from the Server request format to Client call format
          const toolRequest = {
            name: request.params.name,
            arguments: request.params.arguments || {}
          };
          
          console.error(`[Bridge] Converting tool request:`, toolRequest);
          const result = await this.httpClient.callTool(toolRequest);
          console.error(`[Bridge] Tool call successful for ${request.params.name}`);
          return result;
        } catch (error) {
          console.error(`[Bridge] Tool call failed for ${request.params.name}:`, error.message);
          console.error(`[Bridge] Error details:`, error);
          throw error;
        }
      });

      // Connect stdio transport
      const transport = new StdioServerTransport();
      await this.mcpServer.connect(transport);

      this.isConnected = true;
      console.error(`[Bridge] Stdio-to-HTTP bridge started successfully`);
    } catch (error) {
      console.error(`[Bridge] Failed to start: ${error.message}`);
      throw error;
    }
  }

  async stop() {
    if (this.isConnected) {
      if (this.httpClient) {
        this.httpClient.close();
      }
      if (this.mcpServer) {
        this.mcpServer.close();
      }
      this.isConnected = false;
      console.error(`[Bridge] Stdio-to-HTTP bridge stopped`);
    }
  }
}

// Main entry point when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const httpUrl = process.argv[2];
  
  if (!httpUrl) {
    console.error('[Bridge] Usage: node stdio-http-bridge.js <http-url>');
    process.exit(1);
  }

  const bridge = new StdioHttpBridge(httpUrl);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('[Bridge] Received SIGINT, shutting down...');
    await bridge.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('[Bridge] Received SIGTERM, shutting down...');
    await bridge.stop();
    process.exit(0);
  });

  // Start the bridge
  bridge.start().catch((error) => {
    console.error(`[Bridge] Failed to start: ${error.message}`);
    process.exit(1);
  });
}