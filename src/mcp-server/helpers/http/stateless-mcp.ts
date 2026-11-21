// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type IncomingMessage, type ServerResponse } from "node:http";
import { type AddressInfo } from "node:net";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import express, { type Request, type Response } from "express";
import { errorMessage } from "#src/shared/error-message.ts";

export interface JsonRpcError {
  jsonrpc: string;
  error: {
    code: number;
    message: string;
  };
  id: null;
}

export const methodNotAllowed: JsonRpcError = {
  jsonrpc: "2.0",
  error: {
    code: ErrorCode.ConnectionClosed,
    message: "Method not allowed.",
  },
  id: null,
};

/**
 * @param message - What went wrong
 * @returns The JSON-RPC body for a 500 on /mcp
 */
export function internalError(message: string): JsonRpcError {
  return {
    jsonrpc: "2.0",
    error: {
      code: ErrorCode.InternalError,
      message: `Internal server error: ${message}`,
    },
    id: null,
  };
}

/** A running stateless MCP server. */
export interface StatelessMcpServer {
  /** The MCP endpoint to hand a client. */
  url: string;
  close: () => Promise<void>;
}

/**
 * Serve one stateless MCP POST with a fresh transport, and tear both down when
 * the response closes.
 * @param server - The MCP server built for this request
 * @param req - The incoming request
 * @param res - The response
 * @param body - The parsed JSON body
 */
export async function serveStatelessMcp(
  server: McpServer,
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
  });

  // A failed close has nowhere to go: the response is done, and the logger
  // needs Max, which probes and test harnesses don't have. Swallow it, or the
  // unhandled rejection takes down the process.
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

/**
 * Answer GET and DELETE on /mcp with 405. A stateless server has no SSE stream
 * to open and no session to end; the 405 is what stops the SDK client retrying.
 * @param app - The express app serving /mcp
 */
export function rejectStatelessMcpMethods(app: express.Express): void {
  app.get("/mcp", (_req: Request, res: Response): void => {
    res.status(405).json(methodNotAllowed);
  });
  app.delete("/mcp", (_req: Request, res: Response): void => {
    res.status(405).json(methodNotAllowed);
  });
}

/**
 * Start a stateless MCP server on an ephemeral port, so it can't collide with a
 * real Producer Pal device on 3350. For probes and test harnesses.
 * @param createServer - Builds the MCP server for each POST
 * @returns The server's URL and a close function
 */
export async function startStatelessMcpServer(
  createServer: () => McpServer,
): Promise<StatelessMcpServer> {
  const app = express();

  app.use(express.json());
  app.post("/mcp", (req: Request, res: Response) => {
    // Answer like the device's /mcp route does; an unhandled rejection here
    // would crash the process and leave the request hanging.
    serveStatelessMcp(createServer(), req, res, req.body).catch(
      (error: unknown) => {
        if (res.headersSent) {
          res.end();
        } else {
          res.status(500).json(internalError(errorMessage(error)));
        }
      },
    );
  });
  rejectStatelessMcpMethods(app);

  const httpServer = await new Promise<ReturnType<express.Express["listen"]>>(
    (resolve, reject) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));

      listening.on("error", reject);
    },
  );
  const { port } = httpServer.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
