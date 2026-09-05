// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  CLIENT_TOOL_TIMEOUT_MS,
  DISABLED_TOOLS_HEADER,
  FORMAT_HEADER,
  LIVE_API_HEADER,
  SMALL_MODEL_MODE_HEADER,
} from "#src/shared/config.ts";
import { NOTATION_HEADER } from "#src/shared/notation.ts";
import {
  callToolRequest,
  callToolSuccessfully,
  callToolWithMcpError,
  expectBrandedErrorText,
  expectRequestHeaders,
  getHandler,
  mockClient,
  mockLiveApiTool,
  mockServer,
  mockStandardTools,
  mockTransport,
  startAndGetCallHandler,
  type TestBridge,
} from "./stdio-http-bridge-test-helpers.ts";

// The mock objects live in the helper module; these factories only dereference
// them when the mocked constructor is called, so there is no init-order hazard.
// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () => ({
  Client: vi.fn(function () {
    return mockClient;
  }),
}));

// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("@modelcontextprotocol/sdk/client/streamableHttp.js"), () => ({
  StreamableHTTPClientTransport: vi.fn(function () {
    return mockTransport;
  }),
}));

// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("@modelcontextprotocol/sdk/server/index.js"), () => ({
  Server: vi.fn(function () {
    return mockServer;
  }),
}));

// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("@modelcontextprotocol/sdk/server/stdio.js"), () => ({
  StdioServerTransport: vi.fn(function () {
    return mockTransport;
  }),
}));

// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("@modelcontextprotocol/sdk/types.js"), () => ({
  CallToolRequestSchema: "CallToolRequestSchema",
  ListToolsRequestSchema: "ListToolsRequestSchema",
  ErrorCode: { ConnectionClosed: -32000 },
}));

// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("#src/mcp-server/create-mcp-server.ts"), () => ({
  // Mirror the real server's gating: ppal-live-api is registered only when
  // liveApiEnabled is set, and `tools` whitelists the rest — so the portal's
  // offline fallback reflects both.
  createMcpServer: vi.fn(
    (
      _callLiveApi: unknown,
      opts?: { liveApiEnabled?: boolean; tools?: string[] },
    ) => {
      const registered: Record<string, unknown> = opts?.liveApiEnabled
        ? { ...mockStandardTools, ...mockLiveApiTool }
        : mockStandardTools;
      const whitelist = opts?.tools;

      return {
        _registeredTools:
          whitelist == null
            ? registered
            : Object.fromEntries(
                Object.entries(registered).filter(([name]) =>
                  whitelist.includes(name),
                ),
              ),
      };
    },
  ),
}));

// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("zod"), () => ({
  z: {
    toJSONSchema: vi.fn((schema: unknown) => schema), // Pass through for testing
  },
}));

vi.mock(import("../file-logger.ts"), () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import the class after mocking
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { logger } from "../file-logger.ts";
import { StdioHttpBridge } from "../stdio-http-bridge.ts";

describe("StdioHttpBridge", () => {
  let bridge: TestBridge;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Every test starts the bridge, and the real Server's connect and
    // sendToolListChanged both return promises — a bare vi.fn() returns
    // undefined, which the awaiting code would then throw on.
    mockServer.connect.mockResolvedValue(undefined);
    mockServer.sendToolListChanged.mockResolvedValue(undefined);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    bridge = new StdioHttpBridge(
      "http://localhost:3350/mcp",
    ) as unknown as TestBridge;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("constructor", () => {
    it("initializes with correct default values", () => {
      expect(bridge.httpUrl).toBe("http://localhost:3350/mcp");
      expect(bridge.mcpServer).toBeNull();
      expect(bridge.httpClient).toBeNull();
      expect(bridge.isConnected).toBe(false);
      expect(bridge.fallbackTools).toHaveProperty("tools");
    });

    it("accepts custom URL", () => {
      const customBridge = new StdioHttpBridge(
        "http://localhost:8080/mcp",
      ) as unknown as TestBridge;

      expect(customBridge.httpUrl).toBe("http://localhost:8080/mcp");
    });

    it("excludes ppal-live-api from the fallback when not enabled", () => {
      const tools = bridge.fallbackTools.tools;

      expect(tools).toHaveLength(2); // createMcpServer omits ppal-live-api when liveApiEnabled is unset
      expect(tools.map((t) => t.name)).not.toContain("ppal-live-api");

      // Check expected tools are present
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("ppal-read-live-set");
      expect(toolNames).toContain("ppal-create-clip");

      // Verify tool structure
      expect(tools[0]).toStrictEqual({
        name: "ppal-read-live-set",
        title: "Read Live Set",
        description: "Read comprehensive information about the Live Set",
        inputSchema: { type: "object", properties: {} },
      });
    });

    it("includes ppal-live-api in the fallback when liveApiEnabled is forced on", () => {
      const liveApiBridge = new StdioHttpBridge("http://localhost:3350/mcp", {
        liveApiEnabled: true,
      }) as unknown as TestBridge;

      const toolNames = liveApiBridge.fallbackTools.tools.map((t) => t.name);

      expect(toolNames).toContain("ppal-live-api");
      expect(toolNames).toContain("ppal-read-live-set");
    });
  });

  describe("withheld tools", () => {
    /**
     * A bridge that withholds one tool, connected so the transport was built.
     * @returns The transport options the bridge passed
     */
    async function connectWithWithheldTool(): Promise<unknown> {
      const narrowed = new StdioHttpBridge("http://localhost:3350/mcp", {
        disabledTools: ["ppal-create-clip"],
      }) as unknown as TestBridge;

      mockClient.connect.mockResolvedValue(undefined);

      await narrowed._ensureHttpConnection();

      const transportMock = StreamableHTTPClientTransport as unknown as Mock;

      return transportMock.mock.calls.at(-1)?.[1];
    }

    it("sends them as the disabled-tools header on every request", async () => {
      expect(await connectWithWithheldTool()).toStrictEqual({
        requestInit: {
          headers: { [DISABLED_TOOLS_HEADER]: "ppal-create-clip" },
        },
      });
    });

    it("never pushes them via POST /config — that setting is device-global", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("{}"));

      await connectWithWithheldTool();

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("passes no transport options when nothing is withheld", async () => {
      mockClient.connect.mockResolvedValue(undefined);

      await bridge._ensureHttpConnection();

      const transportMock = StreamableHTTPClientTransport as unknown as Mock;

      expect(transportMock.mock.calls.at(-1)?.[1]).toBeUndefined();
    });

    it("drops them from the offline fallback list too", () => {
      // The fallback is what a client caches before the device comes up, and the
      // stateless server has no list_changed to correct it later.
      const narrowed = new StdioHttpBridge("http://localhost:3350/mcp", {
        disabledTools: ["ppal-create-clip"],
      }) as unknown as TestBridge;

      expect(narrowed.fallbackTools.tools.map((t) => t.name)).toStrictEqual([
        "ppal-read-live-set",
      ]);
    });
  });

  describe("_createSetupErrorResponse", () => {
    it("returns setup error response with correct structure", () => {
      const response = bridge._createSetupErrorResponse();

      expect(response).toStrictEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("Cannot connect to Ableton Live."),
          },
        ],
        isError: true,
      });

      expectBrandedErrorText(response);
    });
  });

  describe("_createMisconfiguredUrlResponse", () => {
    it("returns misconfigured URL error response with correct structure", () => {
      const response = bridge._createMisconfiguredUrlResponse();

      expect(response).toStrictEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("Invalid MCP server URL"),
          },
        ],
        isError: true,
      });

      expect(response.content[0]?.text).toContain("http://localhost:3350");
      expectBrandedErrorText(response);
    });
  });

  describe("_ensureHttpConnection", () => {
    it("creates new connection when none exists", async () => {
      mockClient.connect.mockResolvedValue(undefined);

      await bridge._ensureHttpConnection();

      expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);
      expect(bridge.isConnected).toBe(true);
      expect(bridge.httpClient).toBe(mockClient);
    });

    it("handles connection failure and throws appropriate error", async () => {
      const connectionError = new Error("ECONNREFUSED");

      mockClient.connect.mockRejectedValue(connectionError);

      await expect(bridge._ensureHttpConnection()).rejects.toThrow(
        "Failed to connect to Producer Pal MCP server at http://localhost:3350/mcp: ECONNREFUSED",
      );

      expect(bridge.isConnected).toBe(false);
      expect(bridge.httpClient).toBeNull();
    });

    it("reuses existing connection when connected", async () => {
      bridge.httpClient = mockClient;
      bridge.isConnected = true;

      await bridge._ensureHttpConnection();

      expect(mockClient.connect).not.toHaveBeenCalled();
    });

    it("handles stale connection cleanup", async () => {
      bridge.httpClient = mockClient;
      bridge.isConnected = false;
      mockClient.close.mockResolvedValue(undefined);
      mockClient.connect.mockResolvedValue(undefined);

      await bridge._ensureHttpConnection();

      expect(mockClient.close).toHaveBeenCalled();
      expect(mockClient.connect).toHaveBeenCalled();
      expect(bridge.isConnected).toBe(true);
    });

    it("handles error during connection cleanup on failure", async () => {
      const connectionError = new Error("Connection failed");
      const closeError = new Error("Close failed");

      mockClient.connect.mockRejectedValue(connectionError);
      mockClient.close.mockImplementation(() => {
        throw closeError;
      });

      await expect(bridge._ensureHttpConnection()).rejects.toThrow(
        "Failed to connect to Producer Pal MCP server",
      );

      expect(logger.error).toHaveBeenCalledWith(
        "Error closing failed client: Close failed",
      );
      expect(bridge.isConnected).toBe(false);
      expect(bridge.httpClient).toBeNull();
    });

    it("handles error during stale connection cleanup", async () => {
      bridge.httpClient = mockClient;
      bridge.isConnected = false;

      const closeError = new Error("Close failed");

      mockClient.close.mockRejectedValue(closeError);
      mockClient.connect.mockResolvedValue(undefined);

      await bridge._ensureHttpConnection();

      expect(logger.error).toHaveBeenCalledWith(
        "Error closing old client: Close failed",
      );
      expect(bridge.isConnected).toBe(true);
    });

    it("sends small model mode as a header when enabled", async () => {
      await expectRequestHeaders(
        { smallModelMode: true },
        { [SMALL_MODEL_MODE_HEADER]: "true" },
      );
    });

    it("sends smallModelMode: false to force the setting off", async () => {
      await expectRequestHeaders(
        { smallModelMode: false },
        { [SMALL_MODEL_MODE_HEADER]: "false" },
      );
    });

    it("sends notation as a header when set", async () => {
      await expectRequestHeaders(
        { notation: "midi-json" },
        { [NOTATION_HEADER]: "midi-json" },
      );
    });

    it("sends every set option in one header block", async () => {
      await expectRequestHeaders(
        {
          smallModelMode: true,
          notation: "stark",
          jsonOutput: true,
          liveApiEnabled: true,
          disabledTools: ["ppal-create-clip"],
        },
        {
          [SMALL_MODEL_MODE_HEADER]: "true",
          [NOTATION_HEADER]: "stark",
          [FORMAT_HEADER]: "json",
          [LIVE_API_HEADER]: "true",
          [DISABLED_TOOLS_HEADER]: "ppal-create-clip",
        },
      );
    });

    it("sends liveApiEnabled as a header when enabled", async () => {
      // Per-client, not device-global: an agent being evaluated against the same
      // device must not inherit the Direct Live API tool from another portal.
      await expectRequestHeaders(
        { liveApiEnabled: true },
        { [LIVE_API_HEADER]: "true" },
      );
    });

    it("sends liveApiEnabled: false to force the tool off", async () => {
      await expectRequestHeaders(
        { liveApiEnabled: false },
        { [LIVE_API_HEADER]: "false" },
      );
    });

    it("sends JSON output as the format header when requested", async () => {
      await expectRequestHeaders(
        { jsonOutput: true },
        { [FORMAT_HEADER]: "json" },
      );
    });

    it("sends compact output when explicitly requested", async () => {
      await expectRequestHeaders(
        { jsonOutput: false },
        { [FORMAT_HEADER]: "compact" },
      );
    });

    it("sends no headers when no options are set", async () => {
      await expectRequestHeaders({}, null);
    });

    it("does not re-contact the device on a later request when connected", async () => {
      // The settings ride on every request, so there is no device-side state to
      // re-assert — the old POST /config push ran before every single call.
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("{}"));
      const smBridge = new StdioHttpBridge("http://localhost:3350/mcp", {
        smallModelMode: true,
      }) as unknown as TestBridge;

      mockClient.connect.mockResolvedValue(undefined);

      await smBridge._ensureHttpConnection();
      await smBridge._ensureHttpConnection();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockClient.connect).toHaveBeenCalledTimes(1);
      fetchSpy.mockRestore();
    });

    it("dedupes concurrent connection attempts", async () => {
      let resolveConnect: () => void = () => {};

      mockClient.connect.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveConnect = resolve;
          }),
      );

      const ClientCtor = Client as unknown as Mock;
      const callsBefore = ClientCtor.mock.calls.length;

      const p1 = bridge._ensureHttpConnection();
      const p2 = bridge._ensureHttpConnection();
      const p3 = bridge._ensureHttpConnection();

      // Second/third calls should reuse the in-flight promise rather than
      // each constructing a new Client.
      expect(ClientCtor.mock.calls.length - callsBefore).toBe(1);

      resolveConnect();
      await Promise.all([p1, p2, p3]);

      expect(bridge.isConnected).toBe(true);
      expect(ClientCtor.mock.calls.length - callsBefore).toBe(1);
    });
  });

  describe("start", () => {
    it("starts successfully and logs appropriate messages", async () => {
      await bridge.start();

      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
      expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);

      expect(logger.info).toHaveBeenCalledWith("Starting stdio-to-HTTP bridge");
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] Target HTTP URL: http://localhost:3350/mcp",
      );
      expect(logger.info).toHaveBeenCalledWith(
        "stdio-to-HTTP bridge started successfully",
      );
    });

    it("sets up list tools handler that returns HTTP tools when connected", async () => {
      await bridge.start();

      const listToolsHandler = getHandler("ListToolsRequestSchema");
      const httpTools = { tools: [{ name: "test-tool" }] };

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue(httpTools);

      const result = await listToolsHandler({});

      expect(result).toStrictEqual(httpTools);
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] tools/list successful via HTTP",
      );
    });

    it("sets up list tools handler that returns fallback tools when HTTP fails", async () => {
      await bridge.start();

      const listToolsHandler = getHandler("ListToolsRequestSchema");

      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      const result = await listToolsHandler({});

      expect(result).toStrictEqual(bridge.fallbackTools);
      // Verify that fallback behavior was triggered
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] Returning fallback tools list",
      );
    });

    it("notifies tools/list_changed once the device comes online after a fallback list", async () => {
      await bridge.start();

      const listToolsHandler = getHandler("ListToolsRequestSchema");

      mockClient.connect.mockRejectedValueOnce(new Error("Connection failed"));
      await listToolsHandler({});
      expect(mockServer.sendToolListChanged).not.toHaveBeenCalled();

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue({ tools: [] });
      await listToolsHandler({});

      expect(mockServer.sendToolListChanged).toHaveBeenCalledTimes(1);

      // Already re-listed — a later reconnect must not notify again.
      bridge.isConnected = false;
      await listToolsHandler({});

      expect(mockServer.sendToolListChanged).toHaveBeenCalledTimes(1);
    });

    it("still connects, and retries the notification, when the send fails", async () => {
      // The send runs inside _doConnect, so an unhandled failure here would
      // surface to the user as "cannot connect to Ableton Live". The nudge has
      // to survive too: nothing else tells the client to re-list, so spending
      // the flag on a failed send strands it on the cached offline tool list
      // until it restarts.
      await bridge.start();

      const listToolsHandler = getHandler("ListToolsRequestSchema");

      mockClient.connect.mockRejectedValueOnce(new Error("Connection failed"));
      await listToolsHandler({});

      mockServer.sendToolListChanged.mockRejectedValueOnce(
        new Error("no pipe"),
      );
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue({ tools: [{ name: "live" }] });

      expect(await listToolsHandler({})).toStrictEqual({
        tools: [{ name: "live" }],
      });
      expect(bridge.isConnected).toBe(true);
      expect(mockServer.sendToolListChanged).toHaveBeenCalledTimes(1);

      bridge.isConnected = false;
      await listToolsHandler({});

      expect(mockServer.sendToolListChanged).toHaveBeenCalledTimes(2);
    });

    it("skips the notification when the server is already torn down", async () => {
      await bridge.start();

      const listToolsHandler = getHandler("ListToolsRequestSchema");

      mockClient.connect.mockRejectedValueOnce(new Error("Connection failed"));
      await listToolsHandler({});

      // stop() raced the reconnect: there is no server left to notify.
      bridge.mcpServer = null;
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue({ tools: [] });
      await listToolsHandler({});

      expect(mockServer.sendToolListChanged).not.toHaveBeenCalled();
    });

    it("does not notify tools/list_changed when the first connect succeeds", async () => {
      await bridge.start();

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue({ tools: [] });
      await getHandler("ListToolsRequestSchema")({});

      expect(mockServer.sendToolListChanged).not.toHaveBeenCalled();
    });

    it("sets up call tool handler that calls HTTP tool when connected", async () => {
      const callToolHandler = await startAndGetCallHandler(bridge);
      const { result, toolResult } = (await callToolSuccessfully(
        callToolHandler,
        callToolRequest("test-tool", { arg1: "value1" }),
      )) as { result: unknown; toolResult: unknown };

      expect(mockClient.callTool).toHaveBeenCalledWith(
        { name: "test-tool", arguments: { arg1: "value1" } },
        undefined,
        { timeout: CLIENT_TOOL_TIMEOUT_MS },
      );
      expect(result).toStrictEqual(toolResult);
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] Tool call successful for test-tool",
      );
    });

    it("sets up call tool handler that returns setup error when HTTP fails", async () => {
      const callToolHandler = await startAndGetCallHandler(bridge);

      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      const result = await callToolHandler(callToolRequest());

      expect(result).toStrictEqual(bridge._createSetupErrorResponse());
      // Verify that error response behavior was triggered
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] Connectivity problem detected. Returning setup error response",
      );
    });

    it("sets up call tool handler that handles missing arguments", async () => {
      const callToolHandler = await startAndGetCallHandler(bridge);
      const { result, toolResult } = (await callToolSuccessfully(
        callToolHandler,
        { params: { name: "test-tool" } }, // arguments is undefined
      )) as { result: unknown; toolResult: unknown };

      expect(mockClient.callTool).toHaveBeenCalledWith(
        { name: "test-tool", arguments: {} },
        undefined,
        { timeout: CLIENT_TOOL_TIMEOUT_MS },
      );
      expect(result).toStrictEqual(toolResult);
    });

    it("logs tool call details", async () => {
      const callToolHandler = await startAndGetCallHandler(bridge);

      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      await callToolHandler(
        callToolRequest("ppal-read-live-set", { trackIndex: 0 }),
      );

      expect(logger.debug).toHaveBeenCalledWith(
        '[Bridge] Tool call: ppal-read-live-set {"trackIndex":0}',
      );
    });

    it("returns formatted error response for MCP protocol errors", async () => {
      const callToolHandler = await startAndGetCallHandler(bridge);
      const result = await callToolWithMcpError(
        callToolHandler,
        "Invalid tool parameters",
        -32602,
      );

      expect(result).toStrictEqual({
        content: [{ type: "text", text: "Invalid tool parameters" }],
        isError: true,
      });
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] MCP protocol error detected (code -32602), returning the error to the client",
      );
    });

    it("strips redundant MCP error prefix from error message", async () => {
      const callToolHandler = await startAndGetCallHandler(bridge);
      const result = await callToolWithMcpError(
        callToolHandler,
        "MCP error -32602: Invalid parameters",
        -32602,
      );

      expect(result.content[0]?.text).toBe("Invalid parameters");
    });

    it("treats ConnectionClosed (-32000) as a connectivity failure, not a protocol error", async () => {
      // The SDK rejects the in-flight request with ConnectionClosed when the
      // transport drops mid-call (Ableton quit/restarted, device unloaded). That
      // must return setup guidance and reset isConnected — not pass the cryptic
      // "Connection closed" text to the client while leaving isConnected stuck.
      // _ensureHttpConnection() sets isConnected true during the call, so the
      // observed false afterwards proves the catch reset it (old code left true).
      const callToolHandler = await startAndGetCallHandler(bridge);

      const result = await callToolWithMcpError(
        callToolHandler,
        "Connection closed",
        -32000, // ErrorCode.ConnectionClosed
      );

      expect(result).toStrictEqual(bridge._createSetupErrorResponse());
      expect(bridge.isConnected).toBe(false);
    });

    it("returns misconfigured URL error for ERR_INVALID_URL", async () => {
      // Create bridge with invalid URL that will cause ERR_INVALID_URL
      const invalidBridge = new StdioHttpBridge(
        "not-a-valid-url",
      ) as unknown as TestBridge;

      const callToolHandler = await startAndGetCallHandler(invalidBridge);

      const result = await callToolHandler(callToolRequest());

      expect(result).toStrictEqual(
        invalidBridge._createMisconfiguredUrlResponse(),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] Invalid Producer Pal URL in the Desktop Extension config. Returning the dedicated error response for this scenario.",
      );
    });
  });

  describe("stop", () => {
    it("closes HTTP client and MCP server", async () => {
      bridge.httpClient = mockClient;
      bridge.mcpServer = mockServer;

      await bridge.stop();

      expect(mockClient.close).toHaveBeenCalled();
      expect(mockServer.close).toHaveBeenCalled();
      expect(bridge.httpClient).toBeNull();
      expect(bridge.mcpServer).toBeNull();
      expect(bridge.isConnected).toBe(false);

      expect(logger.info).toHaveBeenCalledWith("stdio-to-HTTP bridge stopped");
    });

    it("handles errors when closing clients", async () => {
      const error = new Error("Close failed");

      mockClient.close.mockImplementation(() => {
        throw error;
      });
      mockServer.close.mockImplementation(() => {
        throw error;
      });

      bridge.httpClient = mockClient;
      bridge.mcpServer = mockServer;

      await bridge.stop();

      expect(logger.error).toHaveBeenCalledWith(
        "Error closing HTTP client: Close failed",
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Error closing MCP server: Close failed",
      );

      // Should still clean up references
      expect(bridge.httpClient).toBeNull();
      expect(bridge.mcpServer).toBeNull();
      expect(bridge.isConnected).toBe(false);
    });

    it("handles null clients gracefully", async () => {
      bridge.httpClient = null;
      bridge.mcpServer = null;

      await bridge.stop();

      expect(mockClient.close).not.toHaveBeenCalled();
      expect(mockServer.close).not.toHaveBeenCalled();
      expect(bridge.isConnected).toBe(false);
    });
  });
});
