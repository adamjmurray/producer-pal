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
import { formatErrorResponse } from "../shared/mcp-response-utils.js";
import { logger } from "./file-logger.js";

const SETUP_URL =
  "https://github.com/adamjmurray/producer-pal?tab=readme-ov-file#-producer-pal";

/**
 * stdio-to-HTTP bridge for MCP communication
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
      if (name === "ppal-raw-live-api") continue; // Skip development-only tool

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
    return formatErrorResponse(`❌ Cannot connect to Producer Pal in Ableton Live.
Remind the user that this Claude Desktop extension is for controlling the music production software Ableton Live. It can't work without Ableton Live. It requires Live version 12.2 or higher with Max for Live (e.g. Ableton Live Suite 12.2+).

For Producer Pal to work, the user must ensure:
1. Ableton Live is running (version 12.2+ with Max for Live)
2. The Producer Pal Max for Live device has been added to the Ableton Live Set
3. The device has successfully loaded and shows "Producer Pal Running"

Provide the [detailed setup instructions](${SETUP_URL}) for guidance.`);
  }

  _createMisconfiguredUrlResponse() {
    return formatErrorResponse(`❌ Invalid URL for the Producer Pal Desktop Extension.
We cannot even attempt to connect to Producer Pal inside Ableton Live because the configured URL "${this.httpUrl.replace(/\/mcp$/, "")}" is not a valid URL.
The user must provide a valid URL in the configuration settings for the Claude Desktop Extension for Producer Pal.
The default URL value is http://localhost:3350`);
  }

  async _ensureHttpConnection() {
    // If we have a client and think we're connected, reuse it
    if (this.httpClient && this.isConnected) {
      return;
    }

    // Clean up old client if it exists
    if (this.httpClient) {
      try {
        await this.httpClient.close();
      } catch (error) {
        logger.error(`Error closing old client: ${error.message}`);
      }
      this.httpClient = null;
    }

    // Create new connection
    const url = new URL(this.httpUrl); // let this throw if the URL is invalid, see handling for ERR_INVALID_URL
    try {
      const httpTransport = new StreamableHTTPClientTransport(url);
      this.httpClient = new Client({
        name: "claude-ableton-connector",
        version: "1.0.0",
      });

      await this.httpClient.connect(httpTransport);
      this.isConnected = true;
      console.error("[Bridge] Connected to HTTP MCP server");
    } catch (error) {
      logger.error(`HTTP connection failed: ${error.message}`);
      this.isConnected = false;
      if (this.httpClient) {
        try {
          this.httpClient.close();
        } catch (closeError) {
          logger.error(`Error closing failed client: ${closeError.message}`);
        }
        this.httpClient = null;
      }
      throw new Error(
        `Failed to connect to Producer Pal MCP server at ${this.httpUrl}: ${error.message}`,
      );
    }
  }

  async start() {
    logger.info(`Starting stdio-to-HTTP bridge`);
    logger.debug(`[Bridge] Target HTTP URL: ${this.httpUrl}`);

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
      logger.debug(`[Bridge] Handling tools/list request`);

      // Always try to connect to HTTP server first
      try {
        await this._ensureHttpConnection();
        const result = await this.httpClient.listTools();
        logger.debug(`[Bridge] tools/list successful via HTTP`);
        return result;
      } catch (error) {
        logger.debug(
          `[Bridge] HTTP tools/list failed, using fallback: ${error.message}`,
        );
        this.isConnected = false;
      }

      // Return fallback tools when HTTP is not available
      logger.debug(`[Bridge] Returning fallback tools list`);
      return this.fallbackTools;
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      logger.debug(
        `[Bridge] Tool call: ${request.params.name} ${JSON.stringify(request.params.arguments)}`,
      );

      // Always try to connect to HTTP server first
      try {
        await this._ensureHttpConnection();
        const toolRequest = {
          name: request.params.name,
          arguments: request.params.arguments || {},
        };

        const result = await this.httpClient.callTool(toolRequest);
        logger.debug(
          `[Bridge] Tool call successful for ${request.params.name}`,
        );
        return result;
      } catch (error) {
        logger.error(
          `HTTP tool call failed for ${request.params.name}: ${error.message}`,
        );

        // Check if this is an MCP protocol error (has numeric code) vs connectivity error
        // Any numeric code means we connected and got a structured JSON-RPC response
        if (error.code && typeof error.code === "number") {
          logger.debug(
            `[Bridge] MCP protocol error detected (code ${error.code}), returning the error to the client`,
          );
          // Extract the actual error message, removing any "MCP error {code}:" prefix
          let errorMessage = error.message || `Unknown MCP error ${error.code}`;
          // Strip redundant "MCP error {code}:" prefix if present
          const mcpErrorPrefix = `MCP error ${error.code}: `;
          if (errorMessage.startsWith(mcpErrorPrefix)) {
            errorMessage = errorMessage.slice(mcpErrorPrefix.length);
          }
          return formatErrorResponse(errorMessage);
        }

        // This is a real connectivity/network error
        this.isConnected = false;

        if (error.code === "ERR_INVALID_URL") {
          logger.debug(
            `[Bridge] Invalid Producer Pal URL in the Desktop Extension config. Returning the dedicated error response for this scenario.`,
          );
          return this._createMisconfiguredUrlResponse();
        }
      }

      // Return setup error when Producer Pal is not available
      logger.debug(
        `[Bridge] Connectivity problem detected. Returning setup error response`,
      );
      return this._createSetupErrorResponse();
    });

    // Connect stdio transport
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);

    logger.info(`stdio-to-HTTP bridge started successfully`);
    logger.debug(`[Bridge] HTTP connected: ${this.isConnected}`);
  }

  async stop() {
    if (this.httpClient) {
      try {
        this.httpClient.close();
      } catch (error) {
        logger.error(`Error closing HTTP client: ${error.message}`);
      }
      this.httpClient = null;
    }
    if (this.mcpServer) {
      try {
        this.mcpServer.close();
      } catch (error) {
        logger.error(`Error closing MCP server: ${error.message}`);
      }
      this.mcpServer = null;
    }
    this.isConnected = false;
    logger.info(`stdio-to-HTTP bridge stopped`);
  }
}
