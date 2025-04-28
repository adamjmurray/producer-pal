# HTTP-Based MCP Server Setup and Testing Guide

This guide explains how to create and test an HTTP-based MCP server implementation with StreamableHTTP transport.

## 1. Create the HTTP-based MCP Server

Create a new file `src/echo-http/server.ts` with the following content:

```typescript
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
```

## 2. Install Dependencies

```bash
npm install express
```

## 3. Run the HTTP Server

```bash
node --experimental-transform-types src/echo-http/server.ts
```

## 4. Build and Run the MCP Inspector from Source

The latest MCP Inspector releases may not support newer protocol features like StreamableHTTP. Build from source instead:

```bash
# Clone the repository
git clone https://github.com/modelcontextprotocol/inspector.git
cd inspector

# Install dependencies
npm install

# Start the development version
npm run dev
```

This will output something like `➜  Local:   http://localhost:6274/`. Open this URL in your browser.

## 5. Test with the MCP Inspector

1. Select Transport Type: `Streamable HTTP`
2. Enter the URL `http://localhost:3000/mcp`
3. Click "Connect"
4. In the "Tools" tab, click "List Tools", and select the "echo" tool
5. Send a test message

## 6. Troubleshooting

If you encounter connection issues:

1. Check server console logs for detailed error messages
2. Ensure the server is running and accessible at http://localhost:3000/mcp
3. Try restarting both the server and the Inspector
