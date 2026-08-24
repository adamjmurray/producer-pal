// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Max from "max-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mcpRequests, neverRespondToMcp } from "#src/test/mocks/mock-max.ts";
import { setTimeoutForTesting } from "../../max-api-adapter.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

interface TestState {
  client: Client | null;
  transport: StreamableHTTPClientTransport | null;
}

/**
 * Fetch a URL and assert it serves a non-empty HTML body with no-store caching.
 *
 * @param url - The URL to fetch
 */
async function expectHtmlNoStoreResponse(url: string): Promise<void> {
  const response = await fetch(url);

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("html");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();

  expect(html.length).toBeGreaterThan(0);
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
  const appState = setupExpressAppServer({
    enableDevFeatures: true,
    enableLiveApi: true,
  });

  describe("Server Setup", () => {
    it("should register mcp_response handler when module loads", async () => {
      // Clear the mock and module cache to test fresh registration
      (Max.addHandler as ReturnType<typeof vi.fn>).mockClear();
      vi.resetModules();

      // Re-import the module to trigger handler registration
      await import("../../create-express-app.ts");

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

      const transport = new StreamableHTTPClientTransport(
        new URL(appState.serverUrl),
      );

      await client.connect(transport);

      // Should not throw
      expect(client).toBeDefined();

      await transport.close();
    });
  });

  describe("List Tools", () => {
    const testState = setupTestClient(() => appState.serverUrl);

    it("should list all available tools", async () => {
      const { client } = testState;
      const result = await client!.listTools();

      expect(Array.isArray(result.tools)).toBe(true);
      const toolNames = result.tools.map((tool) => tool.name);

      expect(toolNames).toStrictEqual([
        "ppal-connect",
        "ppal-context",
        "ppal-read-live-set",
        "ppal-update-live-set",
        "ppal-read-track",
        "ppal-create-track",
        "ppal-update-track",
        "ppal-read-scene",
        "ppal-create-scene",
        "ppal-update-scene",
        "ppal-read-clip",
        "ppal-create-clip",
        "ppal-update-clip",
        "ppal-read-device",
        "ppal-create-device",
        "ppal-update-device",
        "ppal-delete",
        "ppal-duplicate",
        "ppal-select",
        "ppal-playback",
        "ppal-library",
        "ppal-live-api",
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
            properties: { id: expect.anything() },
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
            properties: { id: expect.anything() },
          },
        },
      });

      // Additional description checks for read-live-set
      const readLiveSetDesc = toolsByName["ppal-read-live-set"]!.description;

      expect(readLiveSetDesc).toContain("global settings");
      expect(readLiveSetDesc).toContain("track/scene overview");
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
            { cause: error },
          );
        }
      }

      // Check create-clip specifically since it had the issue
      const createClipTool = result.tools.find(
        (tool) => tool.name === "ppal-create-clip",
      );

      expect(createClipTool).toBeDefined();
      expect(createClipTool!.description).toContain("Create MIDI or audio");
      expect(createClipTool!.inputSchema.properties!.path).toBeDefined();
      // The whole point of the hidden aliases: accepted end to end, never
      // published, so the catalog cannot seed the guess it exists to catch.
      expect(
        createClipTool!.inputSchema.properties!.trackIndex,
      ).toBeUndefined();
      expect(
        createClipTool!.inputSchema.properties!.sceneIndex,
      ).toBeUndefined();
    });
  });

  describe("Call Tool", () => {
    const testState = setupTestClient(() => appState.serverUrl);

    it("should call ppal-read-track tool", async () => {
      const { client } = testState;
      // The default Max mock already answers with a bare success, which is all
      // this test needs — the point is the round trip, not the payload.
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

      expect(mcpRequests).toStrictEqual([
        {
          requestId: expect.stringMatching(/^[\da-f-]{36}$/), // UUID format
          tool: "ppal-read-track",
          argsJSON: '{"trackIndex":1,"include":[]}',
          contextJSON: expect.stringContaining("silenceWavPath"),
        },
      ]);
    });

    it("should call list-tracks tool and timeout appropriately", async () => {
      const { client } = testState;
      // This test verifies the MCP server is working but will timeout quickly
      // since we can't mock the full Live API response chain easily

      // Set a short timeout for fast testing
      setTimeoutForTesting(2);

      // Accept the request but never answer, so the request side times out
      neverRespondToMcp();

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

      // A rejecting outlet is past what the responder API covers, so replace it
      // outright — resetMaxMock() puts the default back before the next test.
      Max.outlet = vi.fn().mockRejectedValue(new Error(errorMessage));

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
            new URL(appState.serverUrl),
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
        const response = await fetch(appState.serverUrl, { method });

        expect(response.status).toBe(405);
        const errorResponse = await response.json();

        expect(errorResponse.jsonrpc).toBe("2.0");
        expect(errorResponse.error.code).toBe(-32000); // ConnectionClosed
        expect(errorResponse.error.message).toBe("Method not allowed.");
        expect(errorResponse.id).toBe(null);
      },
    );

    it("should return parse error for invalid JSON", async () => {
      const response = await fetch(appState.serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });

      // Express json middleware returns 400 for invalid JSON
      expect(response.status).toBe(400);
    });

    it("should log a nameless request rather than crash on it", async () => {
      // A POST with no JSON-RPC method (or no body at all) still has to reach
      // the transport, which is what turns it into a protocol error.
      const response = await fetch(appState.serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1 }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Configuration Options", () => {
    it("should create app successfully without configuration options", async () => {
      const { createExpressApp } = await import("../../create-express-app.ts");
      const app = createExpressApp();

      expect(app).toBeDefined();
      // The app should be created successfully without any configuration
    });
  });

  describe("Chat UI", () => {
    let chatUrl: string;
    let contextUrl: string;
    let rootUrl: string;

    beforeAll(() => {
      chatUrl = appState.serverUrl.replace("/mcp", "/chat");
      contextUrl = appState.serverUrl.replace("/mcp", "/context");
      rootUrl = appState.serverUrl.replace("/mcp", "/");
    });

    it("should serve chat UI when enabled", async () => {
      // Chat UI is enabled by default
      await expectHtmlNoStoreResponse(chatUrl);
    });

    it("should serve same UI bundle at /context", async () => {
      await expectHtmlNoStoreResponse(contextUrl);
    });

    it("should redirect / to /chat with a no-store cache header", async () => {
      const response = await fetch(rootUrl, { redirect: "manual" });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/chat");
      // Match the UI bundle's no-store: a cached 302 would freeze the
      // redirect target across device rebuilds if it ever moves.
      expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("should serve the same HTML at /voice", async () => {
      const voiceUrl = appState.serverUrl.replace("/mcp", "/voice");

      await expectHtmlNoStoreResponse(voiceUrl);
    });
  });
});
