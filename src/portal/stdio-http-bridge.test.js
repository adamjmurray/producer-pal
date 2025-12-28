import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock MCP SDK components
const mockClient = {
  connect: vi.fn(),
  close: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
};

const mockServer = {
  setRequestHandler: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
};

const mockTransport = {};

vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () => ({
  Client: vi.fn(function () {
    return mockClient;
  }),
}));

vi.mock(import("@modelcontextprotocol/sdk/client/streamableHttp.js"), () => ({
  StreamableHTTPClientTransport: vi.fn(function () {
    return mockTransport;
  }),
}));

vi.mock(import("@modelcontextprotocol/sdk/server/index.js"), () => ({
  Server: vi.fn(function () {
    return mockServer;
  }),
}));

vi.mock(import("@modelcontextprotocol/sdk/server/stdio.js"), () => ({
  StdioServerTransport: vi.fn(function () {
    return mockTransport;
  }),
}));

vi.mock(import("@modelcontextprotocol/sdk/types.js"), () => ({
  CallToolRequestSchema: "CallToolRequestSchema",
  ListToolsRequestSchema: "ListToolsRequestSchema",
}));

const mockMcpServer = {
  _registeredTools: {
    "ppal-read-live-set": {
      title: "Read Live Set",
      description: "Read comprehensive information about the Live Set",
      inputSchema: { type: "object", properties: {} },
    },
    "ppal-create-clip": {
      title: "Create Clip",
      description: "Creates MIDI clips in Session or Arrangement",
      inputSchema: { type: "object", properties: {} },
    },
    "ppal-raw-live-api": {
      title: "Raw Live API",
      description: "Development only tool",
      inputSchema: { type: "object", properties: {} },
    },
  },
};

vi.mock(import("../mcp-server/create-mcp-server.js"), () => ({
  createMcpServer: vi.fn(() => mockMcpServer),
}));

vi.mock(import("zod"), () => ({
  z: {
    toJSONSchema: vi.fn((schema) => schema), // Pass through for testing
  },
}));

vi.mock(import("./file-logger.js"), () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import the class after mocking
import { logger } from "./file-logger.js";
import { StdioHttpBridge } from "./stdio-http-bridge.js";

describe("StdioHttpBridge", () => {
  let bridge;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    bridge = new StdioHttpBridge("http://localhost:3350/mcp");
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("constructor", () => {
    it("initializes with correct default values", () => {
      expect(bridge.httpUrl).toBe("http://localhost:3350/mcp");
      expect(bridge.options).toEqual({});
      expect(bridge.mcpServer).toBeNull();
      expect(bridge.httpClient).toBeNull();
      expect(bridge.isConnected).toBe(false);
      expect(bridge.fallbackTools).toHaveProperty("tools");
    });

    it("accepts custom options", () => {
      const options = { timeout: 5000 };
      const customBridge = new StdioHttpBridge(
        "http://localhost:8080/mcp",
        options,
      );

      expect(customBridge.httpUrl).toBe("http://localhost:8080/mcp");
      expect(customBridge.options).toEqual(options);
    });

    it("creates bridge with no options", () => {
      const quietBridge = new StdioHttpBridge("http://localhost:3350/mcp");

      expect(quietBridge.options).toEqual({});
    });

    it("generates fallback tools excluding ppal-raw-live-api", () => {
      const tools = bridge.fallbackTools.tools;

      expect(tools).toHaveLength(2); // Based on our mock that has 3 tools minus ppal-raw-live-api
      expect(tools.map((t) => t.name)).not.toContain("ppal-raw-live-api");

      // Check expected tools are present
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("ppal-read-live-set");
      expect(toolNames).toContain("ppal-create-clip");

      // Verify tool structure
      expect(tools[0]).toEqual({
        name: "ppal-read-live-set",
        title: "Read Live Set",
        description: "Read comprehensive information about the Live Set",
        inputSchema: { type: "object", properties: {} },
      });
    });
  });

  describe("_createSetupErrorResponse", () => {
    it("returns setup error response with correct structure", () => {
      const response = bridge._createSetupErrorResponse();

      expect(response).toEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining(
              "Cannot connect to Producer Pal in Ableton Live.",
            ),
          },
        ],
        isError: true,
      });

      expect(response.content[0].text).toContain("Ableton Live is running");
      expect(response.content[0].text).toContain(
        "https://github.com/adamjmurray/producer-pal",
      );
    });
  });

  describe("_ensureHttpConnection", () => {
    it("creates new connection when none exists", async () => {
      mockClient.connect.mockResolvedValue();

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
      mockClient.close.mockResolvedValue();
      mockClient.connect.mockResolvedValue();

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
      mockClient.connect.mockResolvedValue();

      await bridge._ensureHttpConnection();

      expect(logger.error).toHaveBeenCalledWith(
        "Error closing old client: Close failed",
      );
      expect(bridge.isConnected).toBe(true);
    });
  });

  describe("start", () => {
    it("starts successfully and logs appropriate messages", async () => {
      mockServer.connect.mockResolvedValue();

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
      mockServer.connect.mockResolvedValue();
      await bridge.start();

      // Get the handler that was registered
      const calls = mockServer.setRequestHandler.mock.calls;
      const listToolsCall = calls.find(
        (call) => call[0] === "ListToolsRequestSchema",
      );
      const listToolsHandler = listToolsCall[1];

      const httpTools = { tools: [{ name: "test-tool" }] };

      mockClient.connect.mockResolvedValue();
      mockClient.listTools.mockResolvedValue(httpTools);

      const result = await listToolsHandler();

      expect(result).toEqual(httpTools);
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] tools/list successful via HTTP",
      );
    });

    it("sets up list tools handler that returns fallback tools when HTTP fails", async () => {
      mockServer.connect.mockResolvedValue();
      await bridge.start();

      const calls = mockServer.setRequestHandler.mock.calls;
      const listToolsCall = calls.find(
        (call) => call[0] === "ListToolsRequestSchema",
      );
      const listToolsHandler = listToolsCall[1];

      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      const result = await listToolsHandler();

      expect(result).toEqual(bridge.fallbackTools);
      // Verify that fallback behavior was triggered
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] Returning fallback tools list",
      );
    });

    it("sets up call tool handler that calls HTTP tool when connected", async () => {
      mockServer.connect.mockResolvedValue();
      await bridge.start();

      const calls = mockServer.setRequestHandler.mock.calls;
      const callToolCall = calls.find(
        (call) => call[0] === "CallToolRequestSchema",
      );
      const callToolHandler = callToolCall[1];

      const toolResult = { content: [{ type: "text", text: "Success" }] };

      mockClient.connect.mockResolvedValue();
      mockClient.callTool.mockResolvedValue(toolResult);

      const request = {
        params: {
          name: "test-tool",
          arguments: { arg1: "value1" },
        },
      };

      const result = await callToolHandler(request);

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: "test-tool",
        arguments: { arg1: "value1" },
      });
      expect(result).toEqual(toolResult);
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] Tool call successful for test-tool",
      );
    });

    it("sets up call tool handler that returns setup error when HTTP fails", async () => {
      mockServer.connect.mockResolvedValue();
      await bridge.start();

      const calls = mockServer.setRequestHandler.mock.calls;
      const callToolCall = calls.find(
        (call) => call[0] === "CallToolRequestSchema",
      );
      const callToolHandler = callToolCall[1];

      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      const request = {
        params: {
          name: "test-tool",
          arguments: {},
        },
      };

      const result = await callToolHandler(request);

      expect(result).toEqual(bridge._createSetupErrorResponse());
      // Verify that error response behavior was triggered
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] Connectivity problem detected. Returning setup error response",
      );
    });

    it("sets up call tool handler that handles missing arguments", async () => {
      mockServer.connect.mockResolvedValue();
      await bridge.start();

      const calls = mockServer.setRequestHandler.mock.calls;
      const callToolCall = calls.find(
        (call) => call[0] === "CallToolRequestSchema",
      );
      const callToolHandler = callToolCall[1];

      const toolResult = { content: [{ type: "text", text: "Success" }] };

      mockClient.connect.mockResolvedValue();
      mockClient.callTool.mockResolvedValue(toolResult);

      const request = {
        params: {
          name: "test-tool",
          // arguments is undefined
        },
      };

      const result = await callToolHandler(request);

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: "test-tool",
        arguments: {},
      });
      expect(result).toEqual(toolResult);
    });

    it("logs tool call details", async () => {
      mockServer.connect.mockResolvedValue();
      await bridge.start();

      const calls = mockServer.setRequestHandler.mock.calls;
      const callToolCall = calls.find(
        (call) => call[0] === "CallToolRequestSchema",
      );
      const callToolHandler = callToolCall[1];

      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      const request = {
        params: {
          name: "ppal-read-live-set",
          arguments: { trackIndex: 0 },
        },
      };

      await callToolHandler(request);

      expect(logger.debug).toHaveBeenCalledWith(
        '[Bridge] Tool call: ppal-read-live-set {"trackIndex":0}',
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
