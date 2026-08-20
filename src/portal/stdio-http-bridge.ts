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
import {
  CLIENT_TOOL_TIMEOUT_MS,
  DISABLED_TOOLS_HEADER,
  VERSION,
} from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import { formatErrorResponse } from "#src/shared/mcp-response-utils.ts";
import { type Notation } from "#src/shared/notation.ts";
import { buildFallbackTools, type FallbackTool } from "./fallback-tools.ts";
import { logger } from "./file-logger.ts";

const SETUP_URL = "https://producer-pal.org/installation";

// Widened to number on purpose: the code read off a thrown error is an
// unknown narrowed to number, which shares no enum type with ErrorCode, and
// comparing the two directly is what no-unsafe-enum-comparison reports. A
// local `as number` does not survive --fix (no-unnecessary-type-assertion
// deletes it), so the widening lives here instead.
const CONNECTION_CLOSED_CODE: number = ErrorCode.ConnectionClosed;

export interface BridgeOptions {
  smallModelMode?: boolean;
  notation?: Notation;
  jsonOutput?: boolean;
  liveApiEnabled?: boolean;
  /**
   * Tools to withhold from THIS client. Unlike every other option here it is
   * sent as a per-request header, never pushed via POST /config: `config.tools`
   * is a global device setting, so pushing it would strip the tools from the chat
   * UI and any other connected client, and nothing would restore them when this
   * process exits.
   */
  disabledTools?: string[];
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
  // Whether the client may be holding a cached offline fallback list. Set when
  // we serve the fallback, cleared once we've told the client to re-list.
  private servedFallbackTools = false;
  private smallModelMode?: boolean;
  private notation?: Notation;
  private jsonOutput?: boolean;
  private liveApiEnabled?: boolean;
  private disabledTools?: string[];

  constructor(httpUrl: string, options: BridgeOptions = {}) {
    this.httpUrl = httpUrl;
    this.smallModelMode = options.smallModelMode;
    this.notation = options.notation;
    this.jsonOutput = options.jsonOutput;
    this.liveApiEnabled = options.liveApiEnabled;
    this.disabledTools = options.disabledTools;
    this.fallbackTools = buildFallbackTools(options);
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
      // The withheld toolset rides on every request as a header, so it narrows
      // this client's tools/list AND the skills fragments its ppal-connect blob
      // carries, without touching the device's global config.
      const httpTransport = new StreamableHTTPClientTransport(
        url,
        this.disabledTools?.length
          ? {
              requestInit: {
                headers: {
                  [DISABLED_TOOLS_HEADER]: this.disabledTools.join(","),
                },
              },
            }
          : undefined,
      );

      this.httpClient = new Client({
        name: "producer-pal-portal",
        version: "1.0.0",
      });

      await this.httpClient.connect(httpTransport);
      this.isConnected = true;
      console.error("[Bridge] Connected to HTTP MCP server");

      await this._pushConfigOverrides();
      this._notifyToolListChanged();
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
   * Tell the client to re-list tools after an offline→online transition, but
   * only if it was ever served the offline fallback. That list reflects the
   * portal's own config and can't see device-side settings (e.g. Direct Live
   * API toggled on the device rather than forced here), and clients like Claude
   * Desktop cache the tool list forever otherwise. The stateless HTTP server
   * can't send this itself — each POST /mcp is a fresh server — but the portal
   * holds the stdio connection, so it can.
   *
   * Fire-and-forget, and it must stay that way: this runs inside _doConnect's
   * try block, so letting a send failure escape would turn a working connection
   * into a "cannot connect to Ableton Live" error. The whole send is wrapped —
   * a throw and a rejection are equally fatal here.
   */
  private _notifyToolListChanged(): void {
    if (!this.servedFallbackTools) return;

    const server = this.mcpServer;

    if (server == null) return;

    logger.info("Sending tools/list_changed after reconnecting");

    void (async () => {
      try {
        await server.sendToolListChanged();
        // Cleared only once the nudge is actually out. Clearing up front spends
        // the flag on a send that failed, and nothing retries it — the client
        // keeps the cached offline list until it restarts. A duplicate nudge (a
        // reconnect racing this one) only costs an extra re-list.
        this.servedFallbackTools = false;
      } catch (error) {
        logger.error(
          `Failed to send tools/list_changed: ${errorMessage(error)}`,
        );
      }
    })();
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
   *
   * `disabledTools` deliberately does NOT come through here — it is the one
   * per-client setting, and it travels as a request header instead.
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
          // listChanged so the portal can nudge clients to re-list after the
          // device comes online — see _notifyToolListChanged.
          tools: { listChanged: true },
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
      this.servedFallbackTools = true;

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
          // Explicit timeout rather than the SDK's 60s default, which would
          // sit too close to the device's ceiling. The upstream client's own
          // deadline still binds first — this only keeps our leg out of the way.
          const result = await (this.httpClient as Client).callTool(
            toolRequest,
            undefined,
            { timeout: CLIENT_TOOL_TIMEOUT_MS },
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
            errorCode !== CONNECTION_CLOSED_CODE
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
