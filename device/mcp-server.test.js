// device/mcp-server.test.js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class Max {
  static post = vi.fn();

  static mcpResponseHandler = null;

  static addHandler = (message, handler) => {
    if (message === "mcp_response") {
      Max.mcpResponseHandler = handler;
    }
  };

  static outlet = (message, jsonString) => {
    if (message === "mcp_request" && Max.mcpResponseHandler) {
      const data = JSON.parse(jsonString);
      // Defer calling the handler, otherwise the code inside the Promise returned by callLiveApi() hasn't executed yet
      // and the pendingRequests map won't be in the correct state for the handler to work properly.
      setTimeout(() => {
        // TODO: Make a way for these mock responses from v8 to be customized on a per-test basis
        Max.mcpResponseHandler(
          JSON.stringify({ requestId: data.requestId, result: { content: [{ type: "text", text: "{}" }] } })
        );
      }, 1);
    }
  };
}

vi.mock("max-api", () => ({ default: Max }));

describe("MCP Express App", () => {
  let server;
  let serverUrl;

  beforeAll(async () => {
    // Import and start the server
    const { createExpressApp } = await import("./mcp-server/create-express-app.mjs");

    const app = createExpressApp();
    const port = await new Promise((resolve) => {
      server = app.listen(0, () => {
        resolve(server.address().port);
      });
    });

    serverUrl = `http://localhost:${port}/mcp`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe("Client Connection", () => {
    it("should connect to the server and initialize", async () => {
      const client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      await client.connect(transport);

      // Should not throw
      expect(client).toBeDefined();

      await transport.close();
    });
  });

  describe("List Tools", () => {
    let client;
    let transport;

    beforeAll(async () => {
      client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      await client.connect(transport);
    });

    afterAll(async () => {
      if (transport) {
        await transport.close();
      }
    });

    it("should list all available tools", async () => {
      const result = await client.listTools();
      expect(Array.isArray(result.tools)).toBe(true);
      const toolNames = result.tools.map((tool) => tool.name);
      expect(toolNames).toEqual([
        "read-live-set",
        "write-live-set",
        "read-track",
        "write-track",
        "read-scene",
        "write-scene",
        "read-clip",
        "write-clip",
        "delete",
        "duplicate",
        "capture-scene",
        "transport",
      ]);
    });

    it("should provide tool schemas with correct names and descriptions", async () => {
      const result = await client.listTools();

      const readLiveSetTool = result.tools.find((tool) => tool.name === "read-live-set");
      expect(readLiveSetTool).toBeDefined();
      expect(readLiveSetTool.description).toContain("the Live Set");
      expect(readLiveSetTool.description).toContain("global settings");
      expect(readLiveSetTool.description).toContain("all tracks");

      const writeClipTool = result.tools.find((tool) => tool.name === "write-clip");
      expect(writeClipTool).toBeDefined();
      expect(writeClipTool.inputSchema).toBeDefined();
      expect(writeClipTool.inputSchema.properties).toBeDefined();
      expect(writeClipTool.inputSchema.properties.trackIndex).toBeDefined();
      expect(writeClipTool.inputSchema.properties.clipSlotIndex).toBeDefined();
    });
  });

  describe("Call Tool", () => {
    let client;
    let transport;

    beforeAll(async () => {
      client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      await client.connect(transport);
    });

    afterAll(async () => {
      if (transport) {
        await transport.close();
      }
    });

    it("should call list-tracks tool", async () => {
      const result = await client.callTool({
        name: "read-live-set",
        arguments: {},
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe("text");

      // Parse the JSON response
      const mockReturnValue = JSON.parse(result.content[0].text);
      // this is hard-coded in our mock Max class above:
      expect(mockReturnValue).toEqual({});
    });

    it("should handle tool with missing required arguments", async () => {
      await expect(
        client.callTool({
          name: "delete-scene",
          arguments: {}, // Missing sceneIndex
        })
      ).rejects.toThrow();
    });

    it("should handle unknown tool", async () => {
      await expect(
        client.callTool({
          name: "nonexistent-tool",
          arguments: {},
        })
      ).rejects.toThrow();
    });
  });

  describe("Multiple Concurrent Clients", () => {
    it("should handle multiple clients connecting simultaneously", async () => {
      const clients = [];
      const transports = [];

      try {
        // Create 3 clients
        for (let i = 0; i < 3; i++) {
          const client = new Client({
            name: `test-client-${i}`,
            version: "1.0.0",
          });

          const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
          await client.connect(transport);

          clients.push(client);
          transports.push(transport);
        }

        // All clients should be able to list tools
        const results = await Promise.all(clients.map((client) => client.listTools()));

        results.forEach((result) => {
          expect(result.tools).toBeDefined();
          expect(result.tools.length).toBeGreaterThan(0);
        });
      } finally {
        // Clean up all clients
        await Promise.all(transports.map((transport) => transport.close()));
      }
    });
  });
});
