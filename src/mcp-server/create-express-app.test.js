import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Max from "max-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_ERROR_DELIMITER } from "../shared/mcp-response-utils.js";
import { setTimeoutForTesting } from "./max-api-adapter.js";

describe("MCP Express App", () => {
  let server;
  let serverUrl;

  beforeAll(async () => {
    // Enable ppal-raw-live-api tool for testing
    process.env.ENABLE_RAW_LIVE_API = "true";

    // Import and start the server first
    const { createExpressApp } = await import("./create-express-app");

    const app = createExpressApp({ timeoutMs: 100 }); // Use a short timeout to avoid hanging tests
    const port = await new Promise((resolve) => {
      server = app.listen(0, () => {
        resolve(server.address().port);
      });
    });

    serverUrl = `http://localhost:${port}/mcp`;

    // Verify that the handler was setup by createExpressApp
    expect(Max.addHandler).toHaveBeenCalledWith(
      "mcp_response",
      expect.any(Function),
    );
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
        "ppal-init",
        "ppal-read-song",
        "ppal-update-song",
        "ppal-create-track",
        "ppal-read-track",
        "ppal-update-track",
        "ppal-capture-scene",
        "ppal-create-scene",
        "ppal-read-scene",
        "ppal-update-scene",
        "ppal-create-clip",
        "ppal-read-clip",
        "ppal-update-clip",
        // "ppal-read-device",
        "ppal-read-view",
        "ppal-update-view",
        "ppal-transport",
        "ppal-delete",
        "ppal-duplicate",
        "ppal-memory",
        "ppal-raw-live-api",
      ]);
    });

    it("should provide tool schemas with correct names and descriptions", async () => {
      const result = await client.listTools();

      const readSongTool = result.tools.find(
        (tool) => tool.name === "ppal-read-song",
      );
      expect(readSongTool).toBeDefined();
      expect(readSongTool.description).toContain("the Live Set");
      expect(readSongTool.description).toContain("global settings");
      expect(readSongTool.description).toContain("all tracks");

      const updateClipTool = result.tools.find(
        (tool) => tool.name === "ppal-update-clip",
      );
      expect(updateClipTool).toBeDefined();
      expect(updateClipTool.inputSchema).toBeDefined();
      expect(updateClipTool.inputSchema.properties).toBeDefined();
      expect(updateClipTool.inputSchema.properties.ids).toBeDefined();

      const createTrackTool = result.tools.find(
        (tool) => tool.name === "ppal-create-track",
      );
      expect(createTrackTool).toBeDefined();
      expect(createTrackTool.description).toContain("Creates new tracks");
      expect(createTrackTool.inputSchema.properties.trackIndex).toBeDefined();
      expect(createTrackTool.inputSchema.properties.count).toBeDefined();

      const updateTrackTool = result.tools.find(
        (tool) => tool.name === "ppal-update-track",
      );
      expect(updateTrackTool).toBeDefined();
      expect(updateTrackTool.description).toContain("Updates properties");
      expect(updateTrackTool.inputSchema.properties.ids).toBeDefined();
    });

    it("should have valid input schemas for all tools", async () => {
      const result = await client.listTools();

      // Every tool should have required fields
      result.tools.forEach((tool) => {
        try {
          expect(tool.name).toBeDefined();
          expect(typeof tool.name).toBe("string");
          expect(tool.name.length).toBeGreaterThan(0);

          expect(tool.description).toBeDefined();
          expect(typeof tool.description).toBe("string");
          expect(tool.description.length).toBeGreaterThan(0);

          expect(tool.inputSchema).toBeDefined();
          expect(tool.inputSchema.type).toBe("object");
          expect(tool.inputSchema.properties).toBeDefined();
          expect(typeof tool.inputSchema.properties).toBe("object");
        } catch (error) {
          // Add tool name to error message for debugging
          throw new Error(
            `Tool "${tool.name}" validation failed: ${error.message}`,
          );
        }
      });

      // Check create-clip specifically since it had the issue
      const createClipTool = result.tools.find(
        (tool) => tool.name === "ppal-create-clip",
      );
      expect(createClipTool).toBeDefined();
      expect(createClipTool.description).toContain("Creates MIDI clips");
      expect(createClipTool.inputSchema.properties.view).toBeDefined();
      expect(createClipTool.inputSchema.properties.trackIndex).toBeDefined();
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

    it("should call ppal-read-track tool", async () => {
      // For this test, we need the mock response handler from test-setup.js
      // The real handleLiveApiResult would try to actually handle the response
      // but we want the mock to provide a fake response
      const mockHandler = vi.fn((message, requestId, tool, argsJSON) => {
        if (message === "mcp_request") {
          // Simulate the response from Max after a short delay
          setTimeout(() => {
            // Call the real handleLiveApiResult with mock data in chunked format
            Max.defaultMcpResponseHandler(
              requestId,
              JSON.stringify({ content: [{ type: "text", text: "{}" }] }),
              MAX_ERROR_DELIMITER,
            );
          }, 1);
        }
      });

      // Replace Max.outlet with our mock for this test
      Max.outlet = mockHandler;

      const result = await client.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: 1 },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe("text");

      // Parse the JSON response
      const mockReturnValue = JSON.parse(result.content[0].text);
      // this is hard-coded in our mock response above:
      expect(mockReturnValue).toEqual({});

      expect(mockHandler).toHaveBeenCalledExactlyOnceWith(
        "mcp_request",
        expect.stringMatching(/^[a-f0-9-]{36}$/), // requestId (UUID format)
        "ppal-read-track", // tool name
        '{"trackIndex":1,"trackType":"regular","include":["notes","rack-chains","instrument","session-clips","arrangement-clips"]}', // argsJSON
      );
    });

    it("should call list-tracks tool and timeout appropriately", async () => {
      // This test verifies the MCP server is working but will timeout quickly
      // since we can't mock the full Live API response chain easily

      // Set a short timeout for fast testing
      setTimeoutForTesting(2);

      // Remove the mcp_response handler to cause a timeout on the request calling side of the flow:
      Max.mcpResponseHandler = null;
      // Also replace Max.outlet with a simple mock that doesn't auto-respond
      Max.outlet = vi.fn();

      const result = await client.callTool({
        name: "ppal-read-song",
        arguments: {},
      });

      // The MCP SDK returns a structured error response instead of throwing
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Tool call 'ppal-read-song' timed out after 2ms",
      );
    });

    it("should handle tool with missing required arguments", async () => {
      await expect(
        client.callTool({
          name: "delete-scene",
          arguments: {}, // Missing sceneIndex
        }),
      ).rejects.toThrow();
    });

    it("should handle unknown tool", async () => {
      await expect(
        client.callTool({
          name: "nonexistent-tool",
          arguments: {},
        }),
      ).rejects.toThrow();
    });

    it("should return isError: true when Max.outlet throws", async () => {
      // This test verifies that errors thrown when sending to Max are properly
      // caught and returned as MCP error responses with isError: true
      const errorMessage = "Simulated tool error";

      // Save the original mock to restore it after
      const originalOutlet = Max.outlet;

      // Replace Max.outlet to throw an error instead of responding
      Max.outlet = vi.fn(() => {
        throw new Error(errorMessage);
      });

      try {
        const result = await client.callTool({
          name: "ppal-read-track",
          arguments: { trackIndex: 0 },
        });

        expect(result).toBeDefined();
        expect(result.isError).toBe(true);
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain(errorMessage);
      } finally {
        // Always restore the original mock
        Max.outlet = originalOutlet;
      }
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

          const transport = new StreamableHTTPClientTransport(
            new URL(serverUrl),
          );
          await client.connect(transport);

          clients.push(client);
          transports.push(transport);
        }

        // All clients should be able to list tools
        const results = await Promise.all(
          clients.map((client) => client.listTools()),
        );

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

  describe("Error Handling", () => {
    it("should return method not allowed for GET /mcp", async () => {
      const response = await fetch(serverUrl, {
        method: "GET",
      });

      expect(response.status).toBe(405);
      const errorResponse = await response.json();
      expect(errorResponse.jsonrpc).toBe("2.0");
      expect(errorResponse.error.code).toBe(-32000); // ConnectionClosed
      expect(errorResponse.error.message).toBe("Method not allowed.");
      expect(errorResponse.id).toBe(null);
    });

    it("should return method not allowed for DELETE /mcp", async () => {
      const response = await fetch(serverUrl, {
        method: "DELETE",
      });

      expect(response.status).toBe(405);
      const errorResponse = await response.json();
      expect(errorResponse.jsonrpc).toBe("2.0");
      expect(errorResponse.error.code).toBe(-32000); // ConnectionClosed
      expect(errorResponse.error.message).toBe("Method not allowed.");
      expect(errorResponse.id).toBe(null);
    });
  });

  describe("Configuration Options", () => {
    it("should create app successfully without configuration options", async () => {
      const { createExpressApp } = await import("./create-express-app");
      const app = createExpressApp();

      expect(app).toBeDefined();
      // The app should be created successfully without any configuration
    });
  });
});
