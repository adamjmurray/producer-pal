# Minimal MCP Server with SSE Transport

This guide demonstrates how to create a minimal MCP server that exposes a simple "echo" tool using the HTTP+SSE transport from the 2024-11-05 protocol version.

## Prerequisites

- Node.js 23+ with TypeScript support
- MCP Inspector (clone from GitHub: `git clone https://github.com/modelcontextprotocol/inspector.git`)

## Installation

```sh
npm install @modelcontextprotocol/sdk express @types/node
```

## Implementation

```typescript
// src/echo-sse/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";

const app = express();

const server = new McpServer({ name: "Echo Server", version: "1.0.0" });

server.tool("echo", { message: z.string() }, async ({ message }) => ({
  content: [{ type: "text", text: `Echo: ${message}` }],
}));

let transport: SSEServerTransport | null = null;

app.get("/sse", (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  server.connect(transport);
});

app.post("/messages", (req, res) => {
  if (transport) {
    transport.handlePostMessage(req, res);
  }
});

app.listen(3000);
```

## Running the Server

```sh
node --experimental-transform-types src/echo-sse/server.ts
```

## Testing with MCP Inspector

1. Build and run the MCP Inspector:

   ```sh
   cd inspector
   npm install
   npm run dev
   ```

2. Open the Inspector in your browser (typically at http://localhost:6274/)

3. Configure the connection:

   - Select "HTTP+SSE" as the Transport Type
   - Enter `http://localhost:3000/sse` as the SSE URL
   - Click "Connect"

4. Test the echo tool:
   - Go to the "Tools" tab
   - Click "List Tools"
   - Select the "echo" tool
   - Enter a message
   - Click "Run Tool"

## Testing with Claude Desktop

Use this `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "echo": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/sse"]
    }
  }
}
```
