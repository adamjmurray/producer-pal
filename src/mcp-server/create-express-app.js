import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import Max from "max-api";
import chatUiHtml from "virtual:chat-ui-html";
import { createMcpServer } from "./create-mcp-server.js";
import { callLiveApi } from "./max-api-adapter.js";
import * as console from "./node-for-max-logger.js";

let chatUIEnabled = true; // default

Max.addHandler(
  "chatUIEnabled",
  // eslint-disable-next-line eqeqeq -- intentional loose equality to handle Max's polymorphic input types: "1", true, [1], etc
  (input) => (chatUIEnabled = input == 1 || input === "true"),
);

let smallModelMode = false; // default

Max.addHandler(
  "smallModelMode",
  // eslint-disable-next-line eqeqeq -- intentional loose equality to handle Max's polymorphic input types: "1", true, [1], etc
  (input) => (smallModelMode = input == 1 || input === "true"),
);

const methodNotAllowed = {
  jsonrpc: "2.0",
  error: {
    code: ErrorCode.ConnectionClosed,
    message: "Method not allowed.",
  },
  id: null,
};

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
 * @returns {object} - Configured Express app
 */
export function createExpressApp() {
  const app = express();

  // CORS middleware for MCP Inspector support
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "*");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    next();
  });

  app.use(express.json());

  app.post("/mcp", async (req, res) => {
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
      res.status(500).json(internalError(error.message));
    }
  });

  // Stateless server doesn't support SSE streams, so GET is not allowed.
  // Returning 405 tells the MCP SDK not to attempt SSE reconnection.
  app.get("/mcp", async (_req, res) => res.status(405).json(methodNotAllowed));

  // Because we're using a stateless server, DELETE is not needed:
  app.delete("/mcp", async (_req, res) =>
    res.status(405).json(methodNotAllowed),
  );

  // Allow chat UI to be disabled for security
  app.use("/chat", (req, res, next) => {
    if (!chatUIEnabled) {
      return res.status(403).send("Chat UI is disabled");
    }

    next();
  });

  // Serve the chat UI (inlined for frozen .amxd builds)
  app.get("/chat", (_req, res) => {
    res.type("html").send(chatUiHtml);
  });

  return app;
}
