import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";

async function main() {
  // Create Express app
  const app = express();
  app.use(express.json());

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  // Create the MCP server
  const getServer = () => {
    const server = new McpServer({
      name: "Echo Server HTTP",
      version: "1.0.0",
    });

    // Add echo tool
    server.tool("echo", { message: z.string() }, async ({ message }) => ({
      content: [{ type: "text", text: `Echo: ${message}` }],
    }));

    return server;
  };

  // Handle MCP endpoint for all HTTP methods
  app.all("/mcp", async (req, res) => {
    console.error(`Received ${req.method} MCP request`);

    // Check for existing session ID
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else if (req.method === "POST" && (!sessionId || !transports[sessionId])) {
      // New session or initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          console.error(`Session initialized: ${newSessionId}`);
          transports[newSessionId] = transport;
        },
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          console.error(`Session closed: ${transport.sessionId}`);
          delete transports[transport.sessionId];
        }
      };

      const server = getServer();
      await server.connect(transport);
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    // Handle the request
    try {
      await transport.handleRequest(req, res, req.method === "POST" ? req.body : undefined);
    } catch (error) {
      console.error("Error handling request:", error);
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

  // Start the server
  const PORT = 3000;
  app.listen(PORT, () => {
    console.error(`MCP Echo Server listening on http://localhost:${PORT}/mcp`);
  });
}

main().catch((error) => {
  console.error("Error in MCP server:", error);
  process.exit(1);
});
