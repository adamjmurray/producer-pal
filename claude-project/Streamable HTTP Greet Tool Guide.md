# MCP Server with Greet Tool: Streamable HTTP Transport

A minimal reference implementation for an MCP server that exposes a greeting tool using Streamable HTTP transport.

## Prerequisites

- Node.js 23+
- Working directory: `/Users/adammurray/workspace/ableton-live-composition-assistant`
- Dependencies installed: `@modelcontextprotocol/sdk zod express @types/node @types/express`

## File Structure

```
/Users/adammurray/workspace/ableton-live-composition-assistant/
├── src/
│   └── server/
│       └── streamable-greet-tool.ts
```

## Server Implementation

Create the server file:

```typescript
// src/server/streamable-greet-tool.ts
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const app = express();
app.use(express.json());

// Server factory function to create a new server for each request
function createServer() {
  const server = new McpServer({
    name: "streamable-greet-tool-server",
    version: "1.0.0",
  });

  // Add greeting tool
  server.tool(
    "greet",
    "Generates a greeting message for the provided name",
    {
      name: z.string().describe("Name to greet"),
      language: z.enum(["en", "es", "fr", "de"]).default("en").describe("Language code (en, es, fr, de)"),
    },
    async ({ name, language }) => {
      console.log(`Tool called: greet with name="${name}" language="${language}"`);

      let greeting;
      switch (language) {
        case "es":
          greeting = `¡Hola, ${name}!`;
          break;
        case "fr":
          greeting = `Bonjour, ${name}!`;
          break;
        case "de":
          greeting = `Hallo, ${name}!`;
          break;
        default:
          greeting = `Hello, ${name}!`;
      }
      return { content: [{ type: "text", text: greeting }] };
    }
  );

  return server;
}

// Handle POST requests (stateless mode)
app.post("/mcp", async (req, res) => {
  console.log(`POST /mcp request received:`, {
    body: req.body,
    headers: req.headers,
  });

  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    // Clean up when request is done
    res.on("close", () => {
      console.log("POST /mcp connection closed");
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.InternalError,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

// GET endpoint (required for Streamable HTTP but not used in stateless mode)
app.get("/mcp", async (req, res) => {
  console.log(`GET /mcp request received:`, {
    headers: req.headers,
    query: req.query,
  });

  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: ErrorCode.ConnectionClosed,
      message: "Method not allowed.",
    },
    id: null,
  });
});

// DELETE endpoint (required for Streamable HTTP but not used in stateless mode)
app.delete("/mcp", async (req, res) => {
  console.log(`DELETE /mcp request received:`, {
    headers: req.headers,
    query: req.query,
  });

  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: ErrorCode.ConnectionClosed,
      message: "Method not allowed.",
    },
    id: null,
  });
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.error(`MCP Streamable HTTP Server running on http://localhost:${PORT}/mcp`);
});
```

## Running the Server

```bash
node src/server/streamable-greet-tool.ts
```

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector UI:

1. Select Transport Type: Streamable HTTP
2. URL: http://localhost:3000/mcp
3. Go to the "Tools" tab
4. Click "List Tools"
5. Click "greet"
6. Enter a name and select a language
7. Click "Run Tool"

## Testing with Claude Desktop

Edit your Claude Desktop configuration:

```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Add the following to your configuration:

```json
{
  "mcpServers": {
    "streamable-greet-tool": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}
```

Restart Claude Desktop to apply the changes. In a new conversation, Claude can now use the greet tool.
