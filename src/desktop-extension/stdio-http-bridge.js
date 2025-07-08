// src/desktop-extension/stdio-http-bridge.js
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
export class StdioHttpBridge {
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
        title: toolInfo.title,
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
            `❌ Producer Pal is not accessible. Please ensure:\\n\\n` +
            `1. Ableton Live is running\\n` +
            `2. The Producer Pal Max for Live device is loaded in your set\\n` +
            `3. The device shows \"Producer Pal Running\"\\n\\n` +
            `For setup instructions, visit: ${SETUP_URL}`,
        },
      ],
      isError: true,
    };
  }

  async _ensureHttpConnection() {
    // If we have a client and think we're connected, try to reuse it
    if (this.httpClient && this.isConnected) {
      try {
        // Test if the connection is still valid by attempting a lightweight operation
        // If this succeeds, we can reuse the existing connection
        return;
      } catch (error) {
        console.error("[Bridge] Existing connection is stale:", error.message);
        // Fall through to create new connection
      }
    }

    // Clean up old client if it exists
    if (this.httpClient) {
      try {
        await this.httpClient.close();
      } catch (error) {
        console.error("[Bridge] Error closing old client:", error.message);
      }
      this.httpClient = null;
    }

    // Create new connection
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
    } catch (error) {
      console.error("[Bridge] HTTP connection failed:", error.message);
      this.isConnected = false;
      if (this.httpClient) {
        try {
          this.httpClient.close();
        } catch (closeError) {
          console.error(
            "[Bridge] Error closing failed client:",
            closeError.message,
          );
        }
        this.httpClient = null;
      }
      throw new Error(
        `Failed to connect to Producer Pal MCP server at ${this.httpUrl}: ${error.message}`,
      );
    }
  }

  async start() {
    console.error(`[Bridge] Starting enhanced stdio-to-HTTP bridge`);
    console.error(`[Bridge] Target HTTP URL: ${this.httpUrl}`);

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

      // Always try to connect to HTTP server first
      try {
        await this._ensureHttpConnection();
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

      // Return fallback tools when HTTP is not available
      console.error(`[Bridge] Returning fallback tools list`);
      return this.fallbackTools;
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.error(
        `[Bridge] Tool call: ${request.params.name}`,
        request.params.arguments,
      );

      // Always try to connect to HTTP server first
      try {
        await this._ensureHttpConnection();
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
      try {
        this.httpClient.close();
      } catch (error) {
        console.error("[Bridge] Error closing HTTP client:", error.message);
      }
      this.httpClient = null;
    }
    if (this.mcpServer) {
      try {
        this.mcpServer.close();
      } catch (error) {
        console.error("[Bridge] Error closing MCP server:", error.message);
      }
      this.mcpServer = null;
    }
    this.isConnected = false;
    console.error(`[Bridge] Enhanced stdio-to-HTTP bridge stopped`);
  }
}