// device/server.ts
// the MCP server running inside Ableton Live via Node for Max
// device/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";
import Max from "max-api";

// Map to store pending requests and their resolve functions
const pendingRequests = new Map();
let requestCounter = 0;

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

export function createServer(port: number) {
  const app = express();
  app.use(express.json());

  function createMcpServer() {
    const server = new McpServer({
      name: "live-composition-assistant",
      version: "1.0.0",
    });

    // Register tools that will delegate to the Max v8 object
    server.tool(
      "create-clip",
      "Creates an empty MIDI clip at the specified track and clip slot",
      {
        track: z.number().int().min(0).describe("Track index (0-based)"),
        clipSlot: z.number().int().min(0).describe("Clip slot index (0-based)"),
      },
      async (args) => {
        Max.post(`Handling tool call: create-clip(${JSON.stringify({ args })}`);

        // Create a request with a unique ID
        const requestId = requestCounter++;
        const request = {
          requestId,
          tool: "create-clip",
          args,
        };

        // Send the request to Max as JSON
        Max.outlet("mcp_request", JSON.stringify(request));

        // Return a promise that will be resolved when Max responds
        return new Promise((resolve) => {
          pendingRequests.set(requestId, resolve);
        });
      }
    );

    return server;
  }

  app.post("/mcp", async (req, res) => {
    try {
      Max.post("New MCP connection: " + req.body);
      const server = createMcpServer();
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
      Max.post(`Error handling MCP request: ${error}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
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
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  app.delete("/mcp", async (req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  return app.listen(port, () => {
    Max.post(`MCP Server running on http://localhost:${port}/mcp`);
  });
}
