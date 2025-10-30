import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createMcpServer } from "./create-mcp-server";
import { callLiveApi } from "./max-api-adapter.js";
import * as console from "./node-for-max-logger";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

      const server = createMcpServer(callLiveApi);
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

  // Status endpoint - the MCP client may check this
  app.get("/mcp", async (_req, res) =>
    res.status(200).json({
      status: "ready",
      mode: "stateless",
      message: "Use POST to /mcp for MCP requests",
    }),
  );

  // Because we're using a stateless server, DELETE is not needed:
  app.delete("/mcp", async (_req, res) =>
    res.status(405).json(methodNotAllowed),
  );

  // Serve the chat UI
  app.get("/chat", (_req, res) => {
    const htmlPath = join(__dirname, "chat-ui.html");
    res.sendFile(htmlPath);
  });

  return app;
}
