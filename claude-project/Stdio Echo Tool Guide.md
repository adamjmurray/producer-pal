# Standalone MCP server with Echo Tool (stdio transport)

This is a proof-of-concept of a very simple MCP server with an "echo" tool that simply repeats its input back as the response. To confirm everything is working, we will use the stdio transport and test it directly with Claude Desktop.

## Prerequisites

- Node.js (v23+)
- Claude Desktop application
- The TypeScript MCP SDK is installed with `npm install @modelcontextprotocol/sdk`
- Type definitions are installed with `npm i --save-dev @types/node`
- The `package.json` has `"type": "module",` so we can import from the entry script

## Setup

Inside our project (currently located at `/Users/adammurray/workspace/ableton-live-composition-assistant`):

```sh
mkdir src/echo-stdio
touch src/echo-stdio/server.ts
```

## Implementing the MCP Server and Echo Tool

Create a file named `server.ts` with the following content:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

async function main() {
  // Create an MCP server
  const server = new McpServer({
    name: "Echo Server",
    version: "1.0.0",
  });

  // Add an echo tool that returns whatever message is sent to it
  server.tool("echo", { message: z.string() }, async ({ message }) => ({
    content: [{ type: "text", text: `Echo: ${message}` }],
  }));

  // Use stdio for transport (stdin/stdout)
  const transport = new StdioServerTransport();

  console.error("MCP Echo Server starting...");

  // Connect the server to the transport
  await server.connect(transport);

  console.error("MCP Echo Server connected and ready to receive messages.");
}

main().catch((error) => {
  console.error("Error in MCP server:", error);
  process.exit(1);
});
```

## Configure Claude Desktop

Configure `claude_desktop_config.json` with:

```json
{
  "mcpServers": {
    "echo-stdio": {
      "command": "/opt/homebrew/bin/node",
      "args": [
        "--experimental-transform-types",
        "/Users/adammurray/workspace/ableton-live-composition-assistant/src/echo-stdio/server.ts"
      ]
    }
  }
}
```

## Test

1. Restart Claude Desktop

2. You should see the "echo" tool available to Claude via the echo-stdio server

3. Test by asking Claude something like: "Can you use the echo tool to repeat the message 'Hello, MCP World!'?"

Claude should use the tool and respond with "Echo: Hello, MCP World!"
