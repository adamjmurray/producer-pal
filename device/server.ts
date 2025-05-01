// device/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";
import Max from "max-api";

export function createServer(port: number) {
  const app = express();
  app.use(express.json());

  function createServer() {
    const server = new McpServer({
      name: "live-composition-assistant",
      version: "1.0.0",
    });

    server.tool(
      "greet",
      "Generates a greeting message for the provided name",
      {
        name: z.string().describe("Name to greet"),
        language: z.enum(["en", "es", "fr", "de"]).default("en").describe("Language code"),
      },
      async ({ name, language }) => {
        Max.post(`Called tool with name="${name}" and language="${language}"`);
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

  app.post("/mcp", async (req, res) => {
    try {
      const server = createServer();
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
