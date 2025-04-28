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
