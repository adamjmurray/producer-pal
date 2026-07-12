// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  type CallLiveApiFunction,
  createMcpServer,
} from "#src/mcp-server/create-mcp-server.ts";
import { VERSION } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import { formatErrorResponse } from "#src/shared/mcp-response-utils.ts";
import { type Notation } from "#src/shared/notation.ts";
import { logger } from "./file-logger.ts";

const SETUP_URL = "https://producer-pal.org/installation";

export interface BridgeOptions {
  smallModelMode?: boolean;
  notation?: Notation;
  jsonOutput?: boolean;
  liveApiEnabled?: boolean;
}

interface FallbackTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
}

interface RegisteredToolInfo {
  title?: string;
  description: string;
  inputSchema?: z.ZodType;
}

interface CallToolRequest {
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

/**
 * stdio-to-HTTP bridge for MCP communication
 * Provides graceful fallback when Producer Pal is not running
 */
export class StdioHttpBridge {
  private httpUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Server needed for setRequestHandler proxying
  private mcpServer: Server | null = null;
  private httpClient: Client | null = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private fallbackTools: { tools: FallbackTool[] };
  private smallModelMode?: boolean;
  private notation?: Notation;
  private jsonOutput?: boolean;
  private liveApiEnabled?: boolean;

  constructor(httpUrl: string, options: BridgeOptions = {}) {
    this.httpUrl = httpUrl;
    this.smallModelMode = options.smallModelMode;
    this.notation = options.notation;
    this.jsonOutput = options.jsonOutput;
    this.liveApiEnabled = options.liveApiEnabled;
    this.fallbackTools = this._generateFallbackTools();
  }

  private _generateFallbackTools(): { tools: FallbackTool[] } {
    // Create MCP server to extract tool definitions (callLiveApi not used).
    // Thread notation + small-model mode so the offline fallback descriptions
    // match what the live server would return for the same config.
    const server = createMcpServer(null as unknown as CallLiveApiFunction, {
      smallModelMode: this.smallModelMode,
      notation: this.notation,
    });
    const tools: FallbackTool[] = [];

    // Access private _registeredTools for fallback tool list
    const registeredTools = (
      server as unknown as {
        _registeredTools: Record<string, RegisteredToolInfo>;
      }
    )._registeredTools;

    for (const [name, toolInfo] of Object.entries(registeredTools)) {
      if (name === "ppal-live-api") {
        continue;
      } // Skip opt-in low-level tool from offline fallback list

      tools.push({
        name: name,
        title: toolInfo.title,
        description: toolInfo.description,
        inputSchema: toolInfo.inputSchema
          ? z.toJSONSchema(toolInfo.inputSchema)
          : {
              type: "object",
              properties: {},
            },
      });
    }

    return { tools };
  }

  private _createSetupErrorResponse() {
    return formatErrorResponse(`❌ Cannot connect to Ableton Live.

Ensure Ableton Live 12.3+ is running with the Producer Pal Max for Live device loaded.
Tell the user to check ${SETUP_URL} for setup instructions.

(Producer Pal ${VERSION})`);
  }

  private _createMisconfiguredUrlResponse() {
    return formatErrorResponse(`❌ Invalid MCP server URL: "${this.httpUrl.replace(/\/mcp$/, "")}"

The URL must include protocol (e.g. http://localhost:3350).
Tell the user to check ${SETUP_URL} for configuration help.

(Producer Pal ${VERSION})`);
  }

  private async _ensureHttpConnection(): Promise<void> {
    // If we have a client and think we're connected, reuse it — but still
    // re-assert the config overrides first. The transport is stateless HTTP, so
    // we never observe the device's server restarting (e.g. a fresh device
    // dragged in with default settings, or a connector toggle). Re-pushing on
    // every request keeps the server's config in sync; it no-ops when no
    // overrides are set, so non-override users pay nothing.
    if (this.httpClient && this.isConnected) {
      await this._pushConfigOverrides();

      return;
    }

    // If a connection is already in flight, wait for it instead of starting
    // a second one. Prevents duplicate Client instantiations when concurrent
    // tools/list and tools/call requests arrive before the first connect resolves.
    if (this.connectionPromise) {
      return await this.connectionPromise;
    }

    this.connectionPromise = this._doConnect();

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async _doConnect(): Promise<void> {
    // Clean up old client if it exists
    if (this.httpClient) {
      try {
        await this.httpClient.close();
      } catch (error) {
        logger.error(`Error closing old client: ${errorMessage(error)}`);
      }

      this.httpClient = null;
    }

    // Create new connection
    const url = new URL(this.httpUrl); // let this throw if the URL is invalid, see handling for ERR_INVALID_URL

    try {
      const httpTransport = new StreamableHTTPClientTransport(url);

      this.httpClient = new Client({
        name: "producer-pal-portal",
        version: "1.0.0",
      });

      await this.httpClient.connect(httpTransport);
      this.isConnected = true;
      console.error("[Bridge] Connected to HTTP MCP server");

      await this._pushConfigOverrides();
    } catch (error) {
      logger.error(`HTTP connection failed: ${errorMessage(error)}`);
      this.isConnected = false;

      if (this.httpClient) {
        try {
          await this.httpClient.close();
        } catch (closeError) {
          logger.error(
            `Error closing failed client: ${errorMessage(closeError)}`,
          );
        }

        this.httpClient = null;
      }

      throw new Error(
        `Failed to connect to Producer Pal MCP server at ${this.httpUrl}: ${errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  /**
   * Push the CLI/env config overrides (small-model mode, notation, response
   * format, Direct Live API) to the device via POST /config. Only the
   * explicitly-requested settings are sent, so an unset option leaves the
   * device's own setting alone, and it no-ops (no request) when nothing was
   * requested. Runs before every tools/list and tools/call (via
   * `_ensureHttpConnection`), not just on connect: the server is stateless and
   * global config can reset out from under us (a fresh device with default
   * settings), so we re-assert the overrides each request. This also guarantees
   * the tool list/descriptions reflect the override (e.g. enabling Direct Live
   * API makes `ppal-live-api` appear). The settings are global to the device.
   */
  private async _pushConfigOverrides(): Promise<void> {
    const overrides: {
      smallModelMode?: boolean;
      notation?: Notation;
      jsonOutput?: boolean;
      liveApiEnabled?: boolean;
    } = {};

    // Each override is tri-state: push the value only when set (true OR false),
    // so an unset option leaves the device's own setting alone but an explicit
    // false can turn a setting off.
    if (this.smallModelMode != null)
      overrides.smallModelMode = this.smallModelMode;
    if (this.notation) overrides.notation = this.notation;
    if (this.jsonOutput != null) overrides.jsonOutput = this.jsonOutput;
    if (this.liveApiEnabled != null)
      overrides.liveApiEnabled = this.liveApiEnabled;

    if (Object.keys(overrides).length === 0) return;

    const configUrl = this.httpUrl.replace(/\/mcp$/, "/config");

    try {
      await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
      logger.info(
        `Pushed config overrides to server: ${JSON.stringify(overrides)}`,
      );
    } catch (error) {
      logger.error(`Failed to push config overrides: ${errorMessage(error)}`);
    }
  }

  async start(): Promise<void> {
    logger.info(`Starting stdio-to-HTTP bridge`);
    logger.debug(`[Bridge] Target HTTP URL: ${this.httpUrl}`);

    // Create MCP server that will handle stdio connections
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Server needed for setRequestHandler proxying
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
        // httpClient is guaranteed non-null after successful _ensureHttpConnection()
        const result = await (this.httpClient as Client).listTools();

        logger.debug(`[Bridge] tools/list successful via HTTP`);

        return result;
      } catch (error) {
        logger.debug(
          `[Bridge] HTTP tools/list failed, using fallback: ${errorMessage(error)}`,
        );
        this.isConnected = false;
      }

      // Return fallback tools when HTTP is not available
      logger.debug(`[Bridge] Returning fallback tools list`);

      return this.fallbackTools;
    });

    this.mcpServer.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        logger.debug(
          `[Bridge] Tool call: ${request.params.name} ${JSON.stringify(request.params.arguments)}`,
        );

        // Always try to connect to HTTP server first
        try {
          await this._ensureHttpConnection();
          const toolRequest = {
            name: request.params.name,
            arguments: request.params.arguments ?? {},
          };

          // httpClient is guaranteed non-null after successful _ensureHttpConnection()
          const result = await (this.httpClient as Client).callTool(
            toolRequest,
          );

          logger.debug(
            `[Bridge] Tool call successful for ${request.params.name}`,
          );

          return result;
        } catch (error) {
          logger.error(
            `HTTP tool call failed for ${request.params.name}: ${errorMessage(error)}`,
          );

          // Check if error has code property (Node.js/MCP errors)
          const errorCode =
            error && typeof error === "object" && "code" in error
              ? error.code
              : undefined;

          // A numeric code normally means we connected and got a structured
          // JSON-RPC error — return it to the client. The exception is
          // ConnectionClosed (-32000), which the SDK throws when the transport
          // drops mid-request (Ableton quit/restarted, device unloaded): that is
          // a connectivity failure, so fall through to reset isConnected and
          // return the setup guidance. RequestTimeout (-32001) stays here — a
          // timeout on a still-alive connection must not reset isConnected.
          if (
            typeof errorCode === "number" &&
            errorCode !== ErrorCode.ConnectionClosed
          ) {
            logger.debug(
              `[Bridge] MCP protocol error detected (code ${errorCode}), returning the error to the client`,
            );
            // Extract the actual error message, removing any "MCP error {code}:" prefix
            let errMsg = errorMessage(error);
            // Strip redundant "MCP error {code}:" prefix if present
            const mcpErrorPrefix = `MCP error ${errorCode}: `;

            if (errMsg.startsWith(mcpErrorPrefix)) {
              errMsg = errMsg.slice(mcpErrorPrefix.length);
            }

            return formatErrorResponse(errMsg);
          }

          // This is a real connectivity/network error
          this.isConnected = false;

          if (errorCode === "ERR_INVALID_URL") {
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
      },
    );

    // Connect stdio transport
    const transport = new StdioServerTransport();

    await this.mcpServer.connect(transport);

    logger.info(`stdio-to-HTTP bridge started successfully`);
    logger.debug(`[Bridge] HTTP connected: ${this.isConnected}`);
  }

  async stop(): Promise<void> {
    if (this.httpClient) {
      try {
        await this.httpClient.close();
      } catch (error) {
        logger.error(`Error closing HTTP client: ${errorMessage(error)}`);
      }

      this.httpClient = null;
    }

    if (this.mcpServer) {
      try {
        await this.mcpServer.close();
      } catch (error) {
        logger.error(`Error closing MCP server: ${errorMessage(error)}`);
      }

      this.mcpServer = null;
    }

    this.isConnected = false;
    logger.info(`stdio-to-HTTP bridge stopped`);
  }
}
