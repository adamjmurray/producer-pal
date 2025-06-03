// src/mcp-server/create-express-app.test.js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class Max {
  static post = vi.fn();

  static mcpResponseHandler = null;

  static addHandler = vi.fn((message, handler) => {
    if (message === "mcp_response") {
      Max.mcpResponseHandler = handler;
    }
  });

  static outlet = vi.fn((message, jsonString) => {
    if (message === "mcp_request" && Max.mcpResponseHandler) {
      const data = JSON.parse(jsonString);
      // Defer calling the handler, otherwise the code inside the Promise returned by callLiveApi() hasn't executed yet
      // and the pendingRequests map won't be in the correct state for the handler to work properly.
      setTimeout(() => {
        // TODO: Make a way for these mock responses from v8 to be customized on a per-test basis
        Max.mcpResponseHandler(
          JSON.stringify({ requestId: data.requestId, result: { content: [{ type: "text", text: "{}" }] } }),
        );
      }, 1);
    }
  });
}

vi.mock("max-api", () => ({ default: Max }));

describe("MCP Express App", () => {
  let server;
  let serverUrl;
  let defaultMaxHandler;

  beforeAll(async () => {
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
    expect(Max.addHandler).toHaveBeenCalledWith("mcp_response", expect.any(Function));
    expect(Max.mcpResponseHandler).toBeDefined();
    defaultMaxHandler = Max.addHandler.mock.calls[0][1];
  });

  beforeEach(() => {
    // ensure this is reset to the normal behavior for each test because some overwrite it to trigger error scenarios
    Max.addHandler("mcp_response", defaultMaxHandler);
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
        "transport",
        "read-song",
        "update-song",
        "capture-scene",
        "create-scene",
        "read-scene",
        "update-scene",
        "create-track",
        "read-track",
        "update-track",
        "create-clip",
        "read-clip",
        "update-clip",
        "delete",
        "duplicate",
      ]);
    });

    it("should provide tool schemas with correct names and descriptions", async () => {
      const result = await client.listTools();

      const readSongTool = result.tools.find((tool) => tool.name === "read-song");
      expect(readSongTool).toBeDefined();
      expect(readSongTool.description).toContain("the Live Set");
      expect(readSongTool.description).toContain("global settings");
      expect(readSongTool.description).toContain("all tracks");

      const updateClipTool = result.tools.find((tool) => tool.name === "update-clip");
      expect(updateClipTool).toBeDefined();
      expect(updateClipTool.inputSchema).toBeDefined();
      expect(updateClipTool.inputSchema.properties).toBeDefined();
      expect(updateClipTool.inputSchema.properties.ids).toBeDefined();

      const createTrackTool = result.tools.find((tool) => tool.name === "create-track");
      expect(createTrackTool).toBeDefined();
      expect(createTrackTool.description).toContain("Creates new tracks");
      expect(createTrackTool.inputSchema.properties.trackIndex).toBeDefined();
      expect(createTrackTool.inputSchema.properties.count).toBeDefined();

      const updateTrackTool = result.tools.find((tool) => tool.name === "update-track");
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
          throw new Error(`Tool "${tool.name}" validation failed: ${error.message}`);
        }
      });

      // Check create-clip specifically since it had the issue
      const createClipTool = result.tools.find((tool) => tool.name === "create-clip");
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

    it("should call read-track tool", async () => {
      const result = await client.callTool({
        name: "read-track",
        arguments: { trackIndex: 1 },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe("text");

      // Parse the JSON response
      const mockReturnValue = JSON.parse(result.content[0].text);
      // this is hard-coded in our mock Max class above:
      expect(mockReturnValue).toEqual({});

      expect(Max.outlet).toHaveBeenCalledExactlyOnceWith(
        "mcp_request",
        expect.stringMatching(/^{"requestId":"[a-f0-9\-]+","tool":"read-track","args":{"trackIndex":1}}$/),
      );
    });

    it("should call list-tracks tool and timeout appropriately", async () => {
      // This test verifies the MCP server is working but will timeout quickly
      // since we can't mock the full Live API response chain easily

      // Remove the mcp_response handler to cause a timeout on the request calling side of the flow:
      Max.addHandler("mcp_response", null);

      const result = await client.callTool({
        name: "read-song",
        arguments: {},
      });

      // The MCP SDK returns a structured error response instead of throwing
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Tool call 'read-song' timed out after 100ms");
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
    it("should accept custom timeout options", async () => {
      const { createExpressApp } = await import("./create-express-app");
      const customApp = createExpressApp({ timeoutMs: 5000 });

      expect(customApp).toBeDefined();
      // The timeout is used internally, so we just verify the app was created successfully
    });
  });
});

describe("Exported Functions", () => {
  describe("callLiveApi", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Clear any pending requests between tests
      Max.mcpResponseHandler = null;

      // Remove the callback function for handling Live API call response
      Max.addHandler("mcp_response", null);
    });

    it("should create a request with unique ID and call Max.outlet", async () => {
      const { callLiveApi, handleLiveApiResult } = await import("./create-express-app");

      const promise = callLiveApi("test-tool", { arg1: "value1" });

      expect(Max.outlet).toHaveBeenCalledWith("mcp_request", expect.stringMatching(/^\{.*\}$/));

      // Parse the JSON to verify structure
      const callArgs = Max.outlet.mock.calls[0];
      const requestData = JSON.parse(callArgs[1]);
      expect(requestData).toMatchObject({
        requestId: expect.any(String),
        tool: "test-tool",
        args: { arg1: "value1" },
      });

      // Manually trigger the response using handleLiveApiResult
      handleLiveApiResult(
        JSON.stringify({
          requestId: requestData.requestId,
          result: { content: [{ type: "text", text: "test response" }] },
        }),
      );

      const result = await promise;
      expect(result.content[0].text).toBe("test response");
    });

    it("should timeout after specified timeout period", async () => {
      const { callLiveApi } = await import("./create-express-app");

      // Use a very short timeout for testing
      const promise = callLiveApi("test-tool", {}, 50);

      await expect(promise).rejects.toThrow("Tool call 'test-tool' timed out after 50ms");

      expect(Max.outlet).toHaveBeenCalled();
    });

    it("should use default timeout when not specified", async () => {
      const { callLiveApi, handleLiveApiResult } = await import("./create-express-app");

      const promise = callLiveApi("test-tool", {});

      // We can't easily test the exact timeout, but we can verify the call was made
      expect(Max.outlet).toHaveBeenCalled();

      // Manually trigger response
      const callArgs = Max.outlet.mock.calls[0];
      const requestData = JSON.parse(callArgs[1]);
      handleLiveApiResult(
        JSON.stringify({
          requestId: requestData.requestId,
          result: { content: [{ type: "text", text: "test response" }] },
        }),
      );

      await promise;
    });
  });

  describe("handleLiveApiResult", () => {
    beforeEach(() => {
      vi.clearAllMocks();

      // Remove the callback function for handling Live API call response
      Max.addHandler("mcp_response", null);
    });

    it("should handle valid response with matching request ID", async () => {
      const { callLiveApi, handleLiveApiResult } = await import("./create-express-app");

      // Start a request to create a pending request
      const promise = callLiveApi("test-tool", {});

      // Get the request ID from the outlet call
      const callArgs = Max.outlet.mock.calls[0];
      const requestData = JSON.parse(callArgs[1]);
      const requestId = requestData.requestId;

      // Simulate the response
      const mockResult = { content: [{ type: "text", text: "success" }] };
      handleLiveApiResult(JSON.stringify({ requestId, result: mockResult }));

      const result = await promise;
      expect(result).toEqual(mockResult);
    });

    it("should add maxErrors to result content", async () => {
      const { callLiveApi, handleLiveApiResult } = await import("./create-express-app");

      // Start a request
      const promise = callLiveApi("test-tool", {});

      // Get request ID
      const callArgs = Max.outlet.mock.calls[0];
      const requestData = JSON.parse(callArgs[1]);
      const requestId = requestData.requestId;

      // Simulate response with errors
      const mockResult = { content: [{ type: "text", text: "success" }] };
      handleLiveApiResult(JSON.stringify({ requestId, result: mockResult }), "Error 1", "Error 2");

      const result = await promise;
      expect(result.content).toHaveLength(3);
      expect(result.content[0]).toEqual({ type: "text", text: "success" });
      expect(result.content[1]).toEqual({ type: "text", text: "WARNING: Error 1" });
      expect(result.content[2]).toEqual({ type: "text", text: "WARNING: Error 2" });
    });

    it("should handle unknown request ID", async () => {
      const { handleLiveApiResult } = await import("./create-express-app");

      // Call with unknown request ID
      handleLiveApiResult(
        JSON.stringify({
          requestId: "unknown-id",
          result: { content: [] },
        }),
      );

      // Should log but not throw
      expect(Max.post).toHaveBeenCalledWith("Received response for unknown request ID: unknown-id");
    });

    it("should handle malformed JSON response", async () => {
      const { handleLiveApiResult } = await import("./create-express-app");

      // Call with malformed JSON
      handleLiveApiResult("{ malformed json");

      // Should log error but not throw
      expect(Max.post).toHaveBeenCalledWith(expect.stringContaining("Error handling response from Max:"));
    });
  });
});
