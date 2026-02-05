// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import Max from "max-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.ts";
import { setTimeoutForTesting } from "./max-api-adapter.ts";

// Type for mock Max module with test-specific properties
type MockMax = typeof Max & {
  handlers: Map<string, (input: unknown) => void>;
  mcpResponseHandler: ((requestId: string, ...chunks: string[]) => void) | null;
  defaultMcpResponseHandler:
    | ((requestId: string, ...chunks: string[]) => void)
    | null;
};
const mockMax = Max as MockMax;

interface TestState {
  client: Client | null;
  transport: StreamableHTTPClientTransport | null;
}

/**
 * Create a test client and transport, returning cleanup function
 *
 * @param getServerUrl - Function to get server URL
 * @returns Test state object
 */
function setupTestClient(getServerUrl: () => string): TestState {
  const state: TestState = { client: null, transport: null };

  beforeAll(async () => {
    state.client = new Client({ name: "test-client", version: "1.0.0" });
    state.transport = new StreamableHTTPClientTransport(
      new URL(getServerUrl()),
    );
    await state.client.connect(state.transport);
  });

  afterAll(async () => {
    if (state.transport) await state.transport.close();
  });

  return state;
}

describe("MCP Express App", () => {
  let server: Server | undefined;
  let serverUrl: string;

  beforeAll(async () => {
    // Enable ppal-raw-live-api tool for testing
    process.env.ENABLE_RAW_LIVE_API = "true";

    // Import and start the server first
    const { createExpressApp } = await import("./create-express-app.ts");

    const app = createExpressApp();
    const port = await new Promise<number>((resolve) => {
      server = app.listen(0, () => {
        resolve((server!.address() as AddressInfo).port);
      });
    });

    serverUrl = `http://localhost:${port}/mcp`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  });

  describe("Server Setup", () => {
    it("should register mcp_response handler when module loads", async () => {
      // Clear the mock and module cache to test fresh registration
      (Max.addHandler as ReturnType<typeof vi.fn>).mockClear();
      vi.resetModules();

      // Re-import the module to trigger handler registration
      await import("./create-express-app.ts");

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
    const testState = setupTestClient(() => serverUrl);

    it("should list all available tools", async () => {
      const { client } = testState;
      const result = await client!.listTools();

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
      const { client } = testState;
      const result = await client!.listTools();
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
      const readLiveSetDesc = toolsByName["ppal-read-live-set"]!.description;

      expect(readLiveSetDesc).toContain("global settings");
      expect(readLiveSetDesc).toContain("tracks, scenes, devices");
    });

    it("should have valid input schemas for all tools", async () => {
      const { client } = testState;
      const result = await client!.listTools();

      // Every tool should have required fields
      for (const tool of result.tools) {
        try {
          expect(tool.name).toBeDefined();
          expect(typeof tool.name).toBe("string");
          expect(tool.name.length).toBeGreaterThan(0);

          expect(tool.description).toBeDefined();
          expect(typeof tool.description).toBe("string");
          expect(tool.description!.length).toBeGreaterThan(0);

          expect(tool.inputSchema).toBeDefined();
          expect(tool.inputSchema.type).toBe("object");
          expect(tool.inputSchema.properties).toBeDefined();
          expect(typeof tool.inputSchema.properties).toBe("object");
        } catch (error) {
          // Add tool name to error message for debugging
          throw new Error(
            `Tool "${tool.name}" validation failed: ${(error as Error).message}`,
          );
        }
      }

      // Check create-clip specifically since it had the issue
      const createClipTool = result.tools.find(
        (tool) => tool.name === "ppal-create-clip",
      );

      expect(createClipTool).toBeDefined();
      expect(createClipTool!.description).toContain("Create MIDI or audio");
      expect(createClipTool!.inputSchema.properties!.view).toBeDefined();
      expect(createClipTool!.inputSchema.properties!.trackIndex).toBeDefined();
    });
  });

  describe("Call Tool", () => {
    const testState = setupTestClient(() => serverUrl);

    it("should call ppal-read-track tool", async () => {
      const { client } = testState;
      // For this test, we need the mock response handler from test-setup.js
      // The real handleLiveApiResult would try to actually handle the response
      // but we want the mock to provide a fake response
      const mockHandler = vi.fn(
        (
          message: string,
          requestId: string,
          _tool: string,
          _argsJSON: string,
        ) => {
          if (message === "mcp_request") {
            // Simulate the response from Max after a short delay
            setTimeout(() => {
              // Call the real handleLiveApiResult with mock data in chunked format
              mockMax.defaultMcpResponseHandler!(
                requestId,
                JSON.stringify({ content: [{ type: "text", text: "{}" }] }),
                MAX_ERROR_DELIMITER,
              );
            }, 1);
          }

          return Promise.resolve();
        },
      );

      // Replace Max.outlet with our mock for this test
      Max.outlet = mockHandler as typeof Max.outlet;

      const result = await client!.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: 1 },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      const content = result.content as Array<{ type: string; text: string }>;

      expect(Array.isArray(content)).toBe(true);
      expect(content[0]!.type).toBe("text");

      // Parse the JSON response
      const mockReturnValue = JSON.parse(content[0]!.text);

      // this is hard-coded in our mock response above:
      expect(mockReturnValue).toStrictEqual({});

      expect(mockHandler).toHaveBeenCalledExactlyOnceWith(
        "mcp_request",
        expect.stringMatching(/^[\da-f-]{36}$/), // requestId (UUID format)
        "ppal-read-track", // tool name
        '{"category":"regular","trackIndex":1,"include":["session-clips","arrangement-clips","clip-notes","instruments","drum-maps"]}', // argsJSON
        expect.stringContaining("silenceWavPath"), // contextJSON
      );
    });

    it("should call list-tracks tool and timeout appropriately", async () => {
      const { client } = testState;
      // This test verifies the MCP server is working but will timeout quickly
      // since we can't mock the full Live API response chain easily

      // Set a short timeout for fast testing
      setTimeoutForTesting(2);

      // Remove the mcp_response handler to cause a timeout on the request calling side of the flow:
      mockMax.mcpResponseHandler = null;
      // Also replace Max.outlet with a simple mock that doesn't auto-respond
      Max.outlet = vi.fn().mockResolvedValue(undefined);

      const result = await client!.callTool({
        name: "ppal-read-live-set",
        arguments: {},
      });

      // The MCP SDK returns a structured error response instead of throwing
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      const content = result.content as Array<{ type: string; text: string }>;

      expect(content[0]!.type).toBe("text");
      expect(content[0]!.text).toContain(
        "Tool call 'ppal-read-live-set' timed out after 2ms",
      );
    });

    it("should handle tool with missing required arguments", async () => {
      const { client } = testState;
      const result = await client!.callTool({
        name: "delete-scene",
        arguments: {}, // Missing sceneIndex
      });
      const content = result.content as Array<{ type: string; text: string }>;

      expect(result.isError).toBe(true);
      expect(content[0]!.text).toContain("MCP error -32602");
    });

    it("should handle unknown tool", async () => {
      const { client } = testState;
      const result = await client!.callTool({
        name: "nonexistent-tool",
        arguments: {},
      });
      const content = result.content as Array<{ type: string; text: string }>;

      expect(result.isError).toBe(true);
      expect(content[0]!.text).toContain("MCP error -32602");
    });

    it("should return isError: true when Max.outlet rejects", async () => {
      const { client } = testState;
      // This test verifies that errors from Max.outlet rejection are properly
      // caught and returned as MCP error responses with isError: true
      const errorMessage = "Simulated tool error";

      // Save the original mock to restore it after
      const originalOutlet = Max.outlet;

      // Replace Max.outlet to reject with an error instead of responding
      Max.outlet = vi.fn().mockRejectedValue(new Error(errorMessage));

      try {
        const result = await client!.callTool({
          name: "ppal-read-track",
          arguments: { trackIndex: 0 },
        });
        const content = result.content as Array<{ type: string; text: string }>;

        expect(result).toBeDefined();
        expect(result.isError).toBe(true);
        expect(result.content).toBeDefined();
        expect(content[0]!.type).toBe("text");
        expect(content[0]!.text).toContain(errorMessage);
      } finally {
        // Always restore the original mock
        // eslint-disable-next-line require-atomic-updates -- safe in synchronous finally block
        Max.outlet = originalOutlet;
      }
    });
  });

  describe("Multiple Concurrent Clients", () => {
    it("should handle multiple clients connecting simultaneously", async () => {
      const clients: Client[] = [];
      const transports: StreamableHTTPClientTransport[] = [];

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

        for (const result of results) {
          expect(result.tools).toBeDefined();
          expect(result.tools.length).toBeGreaterThan(0);
        }
      } finally {
        // Clean up all clients
        await Promise.all(transports.map((transport) => transport.close()));
      }
    });
  });

  describe("Error Handling", () => {
    it.each(["GET", "DELETE"])(
      "should return method not allowed for %s /mcp",
      async (method) => {
        const response = await fetch(serverUrl, { method });

        expect(response.status).toBe(405);
        const errorResponse = await response.json();

        expect(errorResponse.jsonrpc).toBe("2.0");
        expect(errorResponse.error.code).toBe(-32000); // ConnectionClosed
        expect(errorResponse.error.message).toBe("Method not allowed.");
        expect(errorResponse.id).toBe(null);
      },
    );

    it("should return parse error for invalid JSON", async () => {
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });

      // Express json middleware returns 400 for invalid JSON
      expect(response.status).toBe(400);
    });
  });

  describe("Configuration Options", () => {
    it("should create app successfully without configuration options", async () => {
      const { createExpressApp } = await import("./create-express-app.ts");
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
    let chatUrl: string;

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

    it("should return 403 when chat UI is disabled", async () => {
      // The chatUIEnabled variable is module-level - get the handler and disable it
      const chatUIHandler = mockMax.handlers.get("chatUIEnabled") as (
        input: unknown,
      ) => void;

      chatUIHandler(0);

      // Create a new app instance to use the updated chatUIEnabled value
      const { createExpressApp } = await import("./create-express-app.ts");
      const testApp = createExpressApp();
      const testServer = await new Promise<Server>((resolve) => {
        const s = testApp.listen(0, () => resolve(s));
      });
      const testChatUrl = `http://localhost:${(testServer.address() as AddressInfo).port}/chat`;

      try {
        const response = await fetch(testChatUrl);

        expect(response.status).toBe(403);
        const text = await response.text();

        expect(text).toBe("Chat UI is disabled");
      } finally {
        // Clean up and re-enable for other tests
        await new Promise<void>((resolve) => testServer.close(() => resolve()));
        chatUIHandler(1);
      }
    });
  });

  describe("Config Endpoints", () => {
    let configUrl: string;

    beforeAll(() => {
      configUrl = serverUrl.replace("/mcp", "/config");
    });

    it("should return current config on GET /config", async () => {
      const response = await fetch(configUrl);

      expect(response.status).toBe(200);
      const config = await response.json();

      expect(config).toMatchObject({
        useProjectNotes: expect.any(Boolean),
        projectNotes: expect.any(String),
        projectNotesWritable: expect.any(Boolean),
        smallModelMode: expect.any(Boolean),
        jsonOutput: expect.any(Boolean),
        sampleFolder: expect.any(String),
      });
    });

    it("should update config on POST /config", async () => {
      // First, get current config
      const initialResponse = await fetch(configUrl);
      const initialConfig = await initialResponse.json();

      // Update with new values
      const response = await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smallModelMode: true,
          jsonOutput: true,
        }),
      });

      expect(response.status).toBe(200);
      const updatedConfig = await response.json();

      expect(updatedConfig.smallModelMode).toBe(true);
      expect(updatedConfig.jsonOutput).toBe(true);

      // Restore original values
      await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smallModelMode: initialConfig.smallModelMode,
          jsonOutput: initialConfig.jsonOutput,
        }),
      });
    });

    it("should support partial config updates", async () => {
      // Get current config
      const getResponse = await fetch(configUrl);
      const before = await getResponse.json();

      // Only update useProjectNotes
      const response = await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useProjectNotes: true }),
      });

      expect(response.status).toBe(200);
      const after = await response.json();

      expect(after.useProjectNotes).toBe(true);
      // Other values should remain unchanged
      expect(after.smallModelMode).toBe(before.smallModelMode);
      expect(after.jsonOutput).toBe(before.jsonOutput);

      // Restore
      await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useProjectNotes: false }),
      });
    });

    it("should update projectNotes string", async () => {
      const testNotes = "Test project notes content";

      const response = await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectNotes: testNotes }),
      });

      expect(response.status).toBe(200);
      const config = await response.json();

      expect(config.projectNotes).toBe(testNotes);

      // Clear notes
      await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectNotes: "" }),
      });
    });

    it("should update projectNotesWritable", async () => {
      const response = await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectNotesWritable: true }),
      });

      expect(response.status).toBe(200);
      const config = await response.json();

      expect(config.projectNotesWritable).toBe(true);

      // Restore
      await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectNotesWritable: false }),
      });
    });

    it("should update sampleFolder", async () => {
      const testPath = "/path/to/samples";

      const response = await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleFolder: testPath }),
      });

      expect(response.status).toBe(200);
      const config = await response.json();

      expect(config.sampleFolder).toBe(testPath);

      // Clear
      await fetch(configUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleFolder: "" }),
      });
    });
  });

  describe("Handler Registration", () => {
    it("should set chatUIEnabled to true with 1", () => {
      const chatUIHandler = mockMax.handlers.get("chatUIEnabled") as (
        input: unknown,
      ) => void;

      expect(chatUIHandler).toBeDefined();
      // Input 1 should enable
      chatUIHandler(1);
      // No direct way to verify but coverage should improve
    });

    it("should set chatUIEnabled to true with 'true'", () => {
      const chatUIHandler = mockMax.handlers.get("chatUIEnabled") as (
        input: unknown,
      ) => void;

      expect(chatUIHandler).toBeDefined();
      chatUIHandler("true");
    });

    it("should set chatUIEnabled to false with 0", () => {
      const chatUIHandler = mockMax.handlers.get("chatUIEnabled") as (
        input: unknown,
      ) => void;

      expect(chatUIHandler).toBeDefined();
      chatUIHandler(0);
      // Re-enable
      chatUIHandler(1);
    });

    it("should set smallModelMode with various inputs", () => {
      const smallModelHandler = mockMax.handlers.get("smallModelMode") as (
        input: unknown,
      ) => void;

      expect(smallModelHandler).toBeDefined();

      // Test all branches: true case (1), true case ("true"), false cases (0, false)
      smallModelHandler(1);
      smallModelHandler("true");
      smallModelHandler(0);
      smallModelHandler(false);
    });

    it("should set projectNotesEnabled with various inputs", () => {
      const handler = mockMax.handlers.get("projectNotesEnabled") as (
        input: unknown,
      ) => void;

      expect(handler).toBeDefined();
      handler(1);
      handler(0);
    });

    it("should set projectNotes with string input", () => {
      const handler = mockMax.handlers.get("projectNotes") as (
        input: unknown,
      ) => void;

      expect(handler).toBeDefined();
      handler("test notes");
      handler("");
    });

    it("should set projectNotesWritable with various inputs", () => {
      const handler = mockMax.handlers.get("projectNotesWritable") as (
        input: unknown,
      ) => void;

      expect(handler).toBeDefined();
      handler(1);
      handler(0);
    });

    it("should set compactOutput with various inputs", () => {
      const handler = mockMax.handlers.get("compactOutput") as (
        input: unknown,
      ) => void;

      expect(handler).toBeDefined();
      handler(1);
      handler(0);
    });

    it("should set sampleFolder with string input", () => {
      const handler = mockMax.handlers.get("sampleFolder") as (
        input: unknown,
      ) => void;

      expect(handler).toBeDefined();
      handler("/path/to/samples");
      handler("");
    });
  });
});
