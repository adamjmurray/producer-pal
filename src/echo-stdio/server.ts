import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

async function main() {
  const server = new McpServer({ name: "Echo Server", version: "1.0.0" });

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
