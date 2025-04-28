# Minimal MCP Streamable HTTP Server

This guide demonstrates how to create a minimal MCP server that exposes a simple "echo" tool using the Streamable HTTP transport.

## Prerequisites

- Node.js 23+ with TypeScript support
- For testing: the latest MCP Inspector code is running locally (the project was cloned with `git clone https://github.com/modelcontextprotocol/inspector.git`)

## Installation

```bash
npm install @modelcontextprotocol/sdk express @types/node
```

Assumptions:

- `package.json` uses `"type": "module"` to enable ESM `import`
- `npm install` was run in the `inspector` project

## Implementation

```typescript
// src/echo-http/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

async function main() {
  const app = express();
  app.use(express.json());

  const server = new McpServer({ name: "Echo Server", version: "1.0.0" });

  server.tool("echo", { message: z.string() }, async ({ message }) => ({
    content: [{ type: "text", text: `Echo: ${message}` }],
  }));

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  await server.connect(transport);

  app.post("/mcp", async (req, res) => {
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      res.status(500).end();
    }
  });

  app.get("/mcp", async (req, res) => {
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      res.status(500).end();
    }
  });

  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`MCP Echo Server listening on http://localhost:${PORT}/mcp`);
  });
}

main().catch((error) => {
  console.error("Error in MCP server:", error);
  process.exit(1);
});
```

## Running the Server

Run the server with:

```bash
node src/echo-http/server.ts
```

## Testing with MCP Inspector

1. Build and run the MCP Inspector:

   ```bash
   npm run dev
   ```

2. Open the Inspector in your browser (typically at http://localhost:6274/)

3. Configure the connection:

   - Select "Streamable HTTP" as the Transport Type
   - Enter `http://localhost:3000/mcp` as the URL
   - Click "Connect"

4. Test the echo tool:
   - Go to the "Tools" tab
   - Click "List Tools" to see available tools
   - Select the "echo" tool
   - Enter a message in the "message" field
   - Click "Run Tool"
   - You should see your message echoed back in the "Tool Result"
