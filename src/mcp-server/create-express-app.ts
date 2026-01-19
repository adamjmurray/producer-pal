import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response, NextFunction, Express } from "express";
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
  (input: unknown) => (chatUIEnabled = parseMaxBoolean(input)),
);

let smallModelMode = false; // default

Max.addHandler(
  "smallModelMode",
  (input: unknown) => (smallModelMode = parseMaxBoolean(input)),
);

interface JsonRpcError {
  jsonrpc: string;
  error: {
    code: number;
    message: string;
  };
  id: null;
}

const methodNotAllowed: JsonRpcError = {
  jsonrpc: "2.0",
  error: {
    code: ErrorCode.ConnectionClosed,
    message: "Method not allowed.",
  },
  id: null,
};

const internalError = (message: string): JsonRpcError => ({
  jsonrpc: "2.0",
  error: {
    code: ErrorCode.InternalError,
    message: `Internal server error: ${message}`,
  },
  id: null,
});

/**
 * Creates and configures an Express application for the MCP server
 *
 * @returns Configured Express app
 */
export function createExpressApp(): Express {
  const app = express();

  // CORS middleware for MCP Inspector support
  app.use((req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "*");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(200).end();

      return;
    }

    next();
  });

  app.use(express.json());

  app.post("/mcp", async (req: Request, res: Response): Promise<void> => {
    try {
      console.info("New MCP connection: " + JSON.stringify(req.body));

      const server = createMcpServer(callLiveApi, { smallModelMode });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
      });

      res.on("close", () => {
        void transport.close();
        void server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(`Error handling MCP request: ${String(error)}`);
      res.status(500).json(internalError(errorMessage(error)));
    }
  });

  // Stateless server doesn't support SSE streams, so GET is not allowed.
  // Returning 405 tells the MCP SDK not to attempt SSE reconnection.
  app.get("/mcp", (_req: Request, res: Response): void => {
    res.status(405).json(methodNotAllowed);
  });

  // Because we're using a stateless server, DELETE is not needed:
  app.delete("/mcp", (_req: Request, res: Response): void => {
    res.status(405).json(methodNotAllowed);
  });

  // Allow chat UI to be disabled for security
  app.use("/chat", (_req: Request, res: Response, next: NextFunction): void => {
    if (!chatUIEnabled) {
      res.status(403).send("Chat UI is disabled");

      return;
    }

    next();
  });

  // Serve the chat UI (inlined for frozen .amxd builds)
  app.get("/chat", (_req: Request, res: Response): void => {
    res.type("html").send(chatUiHtml);
  });

  return app;
}
