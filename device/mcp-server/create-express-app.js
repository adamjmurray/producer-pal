// device/mcp-server/create-express-app.js
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const express = require("express");
const Max = require("max-api");
const { ErrorCode } = require("@modelcontextprotocol/sdk/types.js");
const { createMcpServer } = require("./create-mpc-server.js");

// Map to store pending requests and their resolve functions
const pendingRequests = new Map();

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

function createExpressApp() {
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
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: ErrorCode.InternalError,
            message: `Internal server error: ${error.message}`,
          },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: ErrorCode.InvalidRequest,
        message: "Invalid request: unsupported endpoint GET /mcp",
      },
      id: null,
    });
  });

  app.delete("/mcp", async (req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: ErrorCode.InvalidRequest,
        message: "Invalid request: unsupported endpoint DELETE /mcp",
      },
      id: null,
    });
  });

  return app;
}

module.exports = { createExpressApp };
