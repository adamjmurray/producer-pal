// src/desktop-extension/main.js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createMcpServer } from "../mcp-server/create-mcp-server.js";

const SETUP_URL = "https://adammurray.link/producer-pal";

/**
 * Enhanced stdio-to-HTTP bridge for MCP communication
 * Provides graceful fallback when Producer Pal is not running
 */
class StdioHttpBridge {
  constructor(httpUrl, options = {}) {
    this.httpUrl = httpUrl;
    this.options = options;
    this.mcpServer = null;
    this.httpClient = null;
    this.isConnected = false;
    this.fallbackTools = this._generateFallbackTools();
  }

  _generateFallbackTools() {
    // Create MCP server instance to extract tool definitions
    const server = createMcpServer();
    const tools = [];

    for (const [name, toolInfo] of Object.entries(server._registeredTools)) {
      if (name === "raw-live-api") continue; // Skip development-only tool

      tools.push({
        name: name,
        description: toolInfo.description,
        inputSchema: toolInfo.inputSchema
          ? zodToJsonSchema(toolInfo.inputSchema)
          : {
              type: "object",
              properties: {},
            },
      });
    }

    return { tools };
  }

  _createSetupErrorResponse() {
    return {
      content: [
        {
          type: "text",
          text:
            `❌ Producer Pal is not accessible. Please ensure:\n\n` +
            `1. Ableton Live is running\n` +
            `2. The Producer Pal Max for Live device is loaded in your set\n` +
            `3. The device shows "Producer Pal Running"\n\n` +
            `For setup instructions, visit: ${SETUP_URL}`,
        },
      ],
      isError: true,
    };
  }

  async _tryConnectToHttp() {
    try {
      const httpTransport = new StreamableHTTPClientTransport(
        new URL(this.httpUrl),
      );
      this.httpClient = new Client({
        name: "claude-ableton-connector",
        version: "1.0.0",
      });

      await this.httpClient.connect(httpTransport);
      this.isConnected = true;
      console.error("[Bridge] Connected to HTTP MCP server");
      return true;
    } catch (error) {
      console.error("[Bridge] HTTP connection failed:", error.message);
      this.isConnected = false;
      return false;
    }
  }

  async start() {
    console.error(`[Bridge] Starting enhanced stdio-to-HTTP bridge`);
    console.error(`[Bridge] Target HTTP URL: ${this.httpUrl}`);

    // Try to connect to HTTP server, but don't fail if it's not available
    await this._tryConnectToHttp();

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
      },
    );

    // Set up request handlers
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error(`[Bridge] Handling tools/list request`);

      if (this.isConnected) {
        try {
          const result = await this.httpClient.listTools();
          console.error(`[Bridge] tools/list successful via HTTP`);
          return result;
        } catch (error) {
          console.error(
            `[Bridge] HTTP tools/list failed, using fallback:`,
            error.message,
          );
          this.isConnected = false;
        }
      }

      // Return fallback tools when HTTP is not available
      console.error(`[Bridge] Returning fallback tools list`);
      return this.fallbackTools;
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.error(
        `[Bridge] Tool call: ${request.params.name}`,
        request.params.arguments,
      );

      // Try to reconnect if not connected
      if (!this.isConnected) {
        await this._tryConnectToHttp();
      }

      if (this.isConnected) {
        try {
          const toolRequest = {
            name: request.params.name,
            arguments: request.params.arguments || {},
          };

          const result = await this.httpClient.callTool(toolRequest);
          console.error(
            `[Bridge] Tool call successful for ${request.params.name}`,
          );
          return result;
        } catch (error) {
          console.error(
            `[Bridge] HTTP tool call failed for ${request.params.name}:`,
            error.message,
          );
          this.isConnected = false;
        }
      }

      // Return setup error when Producer Pal is not available
      console.error(`[Bridge] Returning setup error response`);
      return this._createSetupErrorResponse();
    });

    // Connect stdio transport
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);

    console.error(
      `[Bridge] Enhanced stdio-to-HTTP bridge started successfully`,
    );
    console.error(`[Bridge] HTTP connected: ${this.isConnected}`);
  }

  async stop() {
    if (this.httpClient) {
      this.httpClient.close();
    }
    if (this.mcpServer) {
      this.mcpServer.close();
    }
    this.isConnected = false;
    console.error(`[Bridge] Enhanced stdio-to-HTTP bridge stopped`);
  }
}

// Main execution
const port = process.env.PRODUCER_PAL_PORT || 3350;
const httpUrl = `http://localhost:${port}/mcp`;

console.error(`[Bridge] Starting Producer Pal bridge (port ${port})`);

const bridge = new StdioHttpBridge(httpUrl);

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.error("[Bridge] Received SIGINT, shutting down...");
  await bridge.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("[Bridge] Received SIGTERM, shutting down...");
  await bridge.stop();
  process.exit(0);
});

// Start the bridge - this should always succeed now
bridge.start().catch((error) => {
  console.error(`[Bridge] Failed to start enhanced bridge: ${error.message}`);
  process.exit(1);
});
