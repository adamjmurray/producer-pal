// device/mcp-server/create-express-app.mjs
import Max from "max-api";
import express from "express";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./create-mpc-server.mjs";

// Map to store pending requests and their resolve functions
const pendingRequests = new Map();

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
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    try {
      Max.post("New MCP connection: " + JSON.stringify(req.body));
      const server = createMcpServer(pendingRequests);
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
      Max.post(`Error handling MCP request: ${error}`, Max.POST_LEVELS.ERROR);
      res.status(500).json(internalError(error.message));
    }
  });

  app.get("/mcp", async (_req, res) => {
    res.status(405).json(methodNotAllowed);
  });

  app.delete("/mcp", async (_req, res) => {
    res.status(405).json(methodNotAllowed);
  });

  // Listen for responses from Max patch
  Max.addHandler("mcp_response", (responseJson) => {
    Max.post(`mcp_response(${responseJson})`);
    try {
      const response = JSON.parse(responseJson);
      const { requestId, result } = response;

      if (pendingRequests.has(requestId)) {
        const resolve = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);
        resolve(result);
      } else {
        Max.post(`Received response for unknown request ID: ${requestId}`);
      }
    } catch (error) {
      Max.post(`Error handling response from Max: ${error}`);
    }
  });

  return app;
}
