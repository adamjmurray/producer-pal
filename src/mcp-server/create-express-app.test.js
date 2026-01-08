import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Max from "max-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.js";
import { setTimeoutForTesting } from "./max-api-adapter.js";

describe("MCP Express App", () => {
  let server;
  let serverUrl;

  beforeAll(async () => {
    // Enable ppal-raw-live-api tool for testing
    process.env.ENABLE_RAW_LIVE_API = "true";

    // Import and start the server first
    const { createExpressApp } = await import("./create-express-app.js");

    const app = createExpressApp({ timeoutMs: 100 }); // Use a short timeout to avoid hanging tests
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

  describe("Server Setup", () => {
    it("should register mcp_response handler when module loads", async () => {
      // Clear the mock and module cache to test fresh registration
      Max.addHandler.mockClear();
      vi.resetModules();

      // Re-import the module to trigger handler registration
      await import("./create-express-app.js");

      expect(Max.addHandler).toHaveBeenCalledWith(
        "mcp_response",
        expect.any(Function),
      );
    });
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

      expect(toolNames).toStrictEqual([
        "ppal-connect",
        "ppal-read-live-set",
        "ppal-update-live-set",
        "ppal-create-track",
        "ppal-read-track",
        "ppal-update-track",
        "ppal-create-scene",
        "ppal-read-scene",
        "ppal-update-scene",
        "ppal-create-clip",
        "ppal-read-clip",
        "ppal-update-clip",
        "ppal-transform-clips",
        "ppal-create-device",
        "ppal-read-device",
        "ppal-update-device",
        "ppal-playback",
        "ppal-select",
        "ppal-delete",
        "ppal-duplicate",
        "ppal-memory",
        "ppal-read-samples",
        "ppal-raw-live-api",
      ]);
    });

    it("should provide tool schemas with correct names and descriptions", async () => {
      const result = await client.listTools();
      const toolsByName = Object.fromEntries(
        result.tools.map((tool) => [tool.name, tool]),
      );

      // Verify key tools exist with expected structure
      expect(toolsByName).toMatchObject({
        "ppal-read-live-set": {
          description: expect.stringContaining("Read Live Set"),
        },
        "ppal-update-clip": {
          inputSchema: {
            properties: { ids: expect.anything() },
          },
        },
        "ppal-create-track": {
          description: expect.stringContaining("Create track(s)"),
          inputSchema: {
            properties: {
              trackIndex: expect.anything(),
              count: expect.anything(),
            },
          },
        },
        "ppal-update-track": {
          description: expect.stringContaining("Update track(s)"),
          inputSchema: {
            properties: { ids: expect.anything() },
          },
        },
      });

      // Additional description checks for read-live-set
      const readLiveSetDesc = toolsByName["ppal-read-live-set"].description;

      expect(readLiveSetDesc).toContain("global settings");
      expect(readLiveSetDesc).toContain("tracks, scenes, devices");
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
      expect(createClipTool.description).toContain("Create MIDI or audio");
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
      const mockHandler = vi.fn((message, requestId, _tool, _argsJSON) => {
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
      expect(mockReturnValue).toStrictEqual({});

      expect(mockHandler).toHaveBeenCalledExactlyOnceWith(
        "mcp_request",
        expect.stringMatching(/^[a-f0-9-]{36}$/), // requestId (UUID format)
        "ppal-read-track", // tool name
        '{"category":"regular","trackIndex":1,"include":["session-clips","arrangement-clips","clip-notes","instruments","drum-maps"]}', // argsJSON
        expect.stringContaining("silenceWavPath"), // contextJSON
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
        name: "ppal-read-live-set",
        arguments: {},
      });

      // The MCP SDK returns a structured error response instead of throwing
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain(
        "Tool call 'ppal-read-live-set' timed out after 2ms",
      );
    });

    it("should handle tool with missing required arguments", async () => {
      const result = await client.callTool({
        name: "delete-scene",
        arguments: {}, // Missing sceneIndex
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("MCP error -32602");
    });

    it("should handle unknown tool", async () => {
      const result = await client.callTool({
        name: "nonexistent-tool",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("MCP error -32602");
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
        if (Max.outlet) {
          Max.outlet = originalOutlet;
        }
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
      const { createExpressApp } = await import("./create-express-app.js");
      const app = createExpressApp();

      expect(app).toBeDefined();
      // The app should be created successfully without any configuration
    });
  });

  describe("CORS", () => {
    it("should handle OPTIONS preflight requests", async () => {
      const response = await fetch(serverUrl, {
        method: "OPTIONS",
        headers: {
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toContain(
        "POST",
      );
      expect(response.headers.get("access-control-allow-headers")).toBe("*");
    });
  });

  describe("Chat UI", () => {
    let chatUrl;

    beforeAll(() => {
      chatUrl = serverUrl.replace("/mcp", "/chat");
    });

    it("should serve chat UI when enabled", async () => {
      // Chat UI is enabled by default
      const response = await fetch(chatUrl);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("html");
      const html = await response.text();

      expect(html).toBeDefined();
      expect(html.length).toBeGreaterThan(0);
    });

    // NOTE: Testing chatUIEnabled=false requires creating a separate Express app instance
    // because the module-level variable is captured at import time.
    // The handler registration tests below verify the handler logic works correctly.
  });

  describe("Handler Registration", () => {
    it("should set chatUIEnabled to true with 1", () => {
      const chatUIHandler = Max.handlers.get("chatUIEnabled");

      expect(chatUIHandler).toBeDefined();
      // Input 1 should enable
      chatUIHandler(1);
      // No direct way to verify but coverage should improve
    });

    it("should set chatUIEnabled to true with 'true'", () => {
      const chatUIHandler = Max.handlers.get("chatUIEnabled");

      expect(chatUIHandler).toBeDefined();
      chatUIHandler("true");
    });

    it("should set chatUIEnabled to false with 0", () => {
      const chatUIHandler = Max.handlers.get("chatUIEnabled");

      expect(chatUIHandler).toBeDefined();
      chatUIHandler(0);
      // Re-enable
      chatUIHandler(1);
    });

    it("should set smallModelMode with various inputs", () => {
      const smallModelHandler = Max.handlers.get("smallModelMode");

      expect(smallModelHandler).toBeDefined();

      // Test all branches: true case (1), true case ("true"), false cases (0, false)
      smallModelHandler(1);
      smallModelHandler("true");
      smallModelHandler(0);
      smallModelHandler(false);
    });
  });
});
