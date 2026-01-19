import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import Max from "max-api";
import chatUiHtml from "virtual:chat-ui-html";
import { errorMessage } from "#src/shared/error-utils.js";
import { createMcpServer } from "./create-mcp-server.js";
import { callLiveApi } from "./max-api-adapter.js";
import { parseMaxBoolean } from "./max-input-helpers.js";
import * as console from "./node-for-max-logger.js";

let chatUIEnabled = true; // default

Max.addHandler(
  "chatUIEnabled",
  (input) => (chatUIEnabled = parseMaxBoolean(input)),
);

let smallModelMode = false; // default

Max.addHandler(
  "smallModelMode",
  (input) => (smallModelMode = parseMaxBoolean(input)),
);

const methodNotAllowed = {
  jsonrpc: "2.0",
  error: {
    code: ErrorCode.ConnectionClosed,
    message: "Method not allowed.",
  },
  id: null,
};

/**
 * @param {string} message - Error message
 * @returns {object} JSON-RPC error response
 */
const internalError = (message) => ({
  jsonrpc: "2.0",
  error: {
    code: ErrorCode.InternalError,
    message: `Internal server error: ${message}`,
  },
  id: null,
});

/**
 * Creates and configures an Express application for the MCP server
 * @returns {import("express").Express} - Configured Express app
 */
export function createExpressApp() {
  const app = express();

  // CORS middleware for MCP Inspector support
  app.use(
    /**
     * @param {import("express").Request} req - Express request
     * @param {import("express").Response} res - Express response
     * @param {import("express").NextFunction} next - Next middleware
     * @returns {void}
     */
    (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS, DELETE",
      );
      res.setHeader("Access-Control-Allow-Headers", "*");

      // Handle preflight requests
      if (req.method === "OPTIONS") {
        res.status(200).end();

        return;
      }

      next();
    },
  );

  app.use(express.json());

  app.post(
    "/mcp",
    /**
     * @param {import("express").Request} req - Express request
     * @param {import("express").Response} res - Express response
     */
    async (req, res) => {
      try {
        console.info("New MCP connection: " + JSON.stringify(req.body));

        const server = createMcpServer(callLiveApi, { smallModelMode });
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Stateless mode
        });

        res.on("close", () => {
          transport.close();
          server.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error(`Error handling MCP request: ${error}`);
        res.status(500).json(internalError(errorMessage(error)));
      }
    },
  );

  // Stateless server doesn't support SSE streams, so GET is not allowed.
  // Returning 405 tells the MCP SDK not to attempt SSE reconnection.
  app.get(
    "/mcp",
    /**
     * @param {import("express").Request} _req - Express request (unused)
     * @param {import("express").Response} res - Express response
     */
    (_req, res) => {
      res.status(405).json(methodNotAllowed);
    },
  );

  // Because we're using a stateless server, DELETE is not needed:
  app.delete(
    "/mcp",
    /**
     * @param {import("express").Request} _req - Express request (unused)
     * @param {import("express").Response} res - Express response
     */
    (_req, res) => {
      res.status(405).json(methodNotAllowed);
    },
  );

  // Allow chat UI to be disabled for security
  app.use(
    "/chat",
    /**
     * @param {import("express").Request} _req - Express request (unused)
     * @param {import("express").Response} res - Express response
     * @param {import("express").NextFunction} next - Next middleware
     * @returns {void}
     */
    (_req, res, next) => {
      if (!chatUIEnabled) {
        res.status(403).send("Chat UI is disabled");

        return;
      }

      next();
    },
  );

  // Serve the chat UI (inlined for frozen .amxd builds)
  app.get(
    "/chat",
    /**
     * @param {import("express").Request} _req - Express request (unused)
     * @param {import("express").Response} res - Express response
     */
    (_req, res) => {
      res.type("html").send(chatUiHtml);
    },
  );

  return app;
}
