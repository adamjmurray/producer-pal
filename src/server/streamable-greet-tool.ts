// See https://claude.ai/share/526f2e1f-7111-4787-9312-bf3a0b7e5dd0 for discussion
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
