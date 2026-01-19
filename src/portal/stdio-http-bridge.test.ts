import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

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

vi.mock(import("#src/mcp-server/create-mcp-server.js"), () => ({
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

/**
 * Get a registered handler from mockServer.setRequestHandler calls
 * @param schema - Schema name to find (e.g., "CallToolRequestSchema")
 * @param which - Which matching call to return
 * @returns The handler function
 */
function getHandler(
  schema: string,
  which: "first" | "last" = "first",
): (request: unknown) => Promise<unknown> {
  const calls = (mockServer.setRequestHandler as Mock).mock.calls.filter(
    (c: unknown[]) => c[0] === schema,
  );

  return which === "last" ? calls.at(-1)?.[1] : calls[0]?.[1];
}

// Type for accessing private properties on the bridge
interface BridgeInternals {
  httpUrl: string;
  mcpServer: object | null;
  httpClient: object | null;
  isConnected: boolean;
  fallbackTools: {
    tools: Array<{
      name: string;
      title?: string;
      description: string;
      inputSchema: object;
    }>;
  };
  _createSetupErrorResponse: () => {
    content: Array<{ type: string; text: string }>;
    isError: boolean;
  };
  _createMisconfiguredUrlResponse: () => {
    content: Array<{ type: string; text: string }>;
    isError: boolean;
  };
  _ensureHttpConnection: () => Promise<void>;
}

describe("StdioHttpBridge", () => {
  let bridge: StdioHttpBridge & BridgeInternals;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    bridge = new StdioHttpBridge(
      "http://localhost:3350/mcp",
    ) as StdioHttpBridge & BridgeInternals;
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
      ) as StdioHttpBridge & BridgeInternals;

      expect(customBridge.httpUrl).toBe("http://localhost:8080/mcp");
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
      expect(tools[0]).toStrictEqual({
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

      expect(response).toStrictEqual({
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

      expect(response.content[0]?.text).toContain("Ableton Live is running");
      expect(response.content[0]?.text).toContain(
        "https://github.com/adamjmurray/producer-pal",
      );
    });
  });

  describe("_createMisconfiguredUrlResponse", () => {
    it("returns misconfigured URL error response with correct structure", () => {
      const response = bridge._createMisconfiguredUrlResponse();

      expect(response).toStrictEqual({
        content: [
          {
            type: "text",
            text: expect.stringContaining("Invalid URL"),
          },
        ],
        isError: true,
      });

      expect(response.content[0]?.text).toContain("http://localhost:3350");
      expect(response.content[0]?.text).toContain("Desktop Extension");
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
  });

  describe("start", () => {
    it("starts successfully and logs appropriate messages", async () => {
      mockServer.connect.mockResolvedValue(undefined);

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
      mockServer.connect.mockResolvedValue(undefined);
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
      mockServer.connect.mockResolvedValue(undefined);
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

    it("sets up call tool handler that calls HTTP tool when connected", async () => {
      mockServer.connect.mockResolvedValue(undefined);
      await bridge.start();

      const callToolHandler = getHandler("CallToolRequestSchema");
      const toolResult = { content: [{ type: "text", text: "Success" }] };

      mockClient.connect.mockResolvedValue(undefined);
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
      expect(result).toStrictEqual(toolResult);
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] Tool call successful for test-tool",
      );
    });

    it("sets up call tool handler that returns setup error when HTTP fails", async () => {
      mockServer.connect.mockResolvedValue(undefined);
      await bridge.start();

      const callToolHandler = getHandler("CallToolRequestSchema");

      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      const request = {
        params: {
          name: "test-tool",
          arguments: {},
        },
      };

      const result = await callToolHandler(request);

      expect(result).toStrictEqual(bridge._createSetupErrorResponse());
      // Verify that error response behavior was triggered
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] Connectivity problem detected. Returning setup error response",
      );
    });

    it("sets up call tool handler that handles missing arguments", async () => {
      mockServer.connect.mockResolvedValue(undefined);
      await bridge.start();

      const callToolHandler = getHandler("CallToolRequestSchema");
      const toolResult = { content: [{ type: "text", text: "Success" }] };

      mockClient.connect.mockResolvedValue(undefined);
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
      expect(result).toStrictEqual(toolResult);
    });

    it("logs tool call details", async () => {
      mockServer.connect.mockResolvedValue(undefined);
      await bridge.start();

      const callToolHandler = getHandler("CallToolRequestSchema");

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

    it("returns formatted error response for MCP protocol errors", async () => {
      mockServer.connect.mockResolvedValue(undefined);
      await bridge.start();

      const callToolHandler = getHandler("CallToolRequestSchema");

      // Simulate MCP protocol error (has numeric code)
      const mcpError = new Error("Invalid tool parameters") as Error & {
        code: number;
      };

      mcpError.code = -32602;

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.callTool.mockRejectedValue(mcpError);

      const request = {
        params: {
          name: "test-tool",
          arguments: {},
        },
      };

      const result = (await callToolHandler(request)) as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(result).toStrictEqual({
        content: [{ type: "text", text: "Invalid tool parameters" }],
        isError: true,
      });
      expect(logger.debug).toHaveBeenCalledWith(
        "[Bridge] MCP protocol error detected (code -32602), returning the error to the client",
      );
    });

    it("strips redundant MCP error prefix from error message", async () => {
      mockServer.connect.mockResolvedValue(undefined);
      await bridge.start();

      const callToolHandler = getHandler("CallToolRequestSchema");

      // Error with redundant prefix
      const mcpError = new Error(
        "MCP error -32602: Invalid parameters",
      ) as Error & { code: number };

      mcpError.code = -32602;

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.callTool.mockRejectedValue(mcpError);

      const request = {
        params: {
          name: "test-tool",
          arguments: {},
        },
      };

      const result = (await callToolHandler(request)) as {
        content: Array<{ type: string; text: string }>;
      };

      expect(result.content[0]?.text).toBe("Invalid parameters");
    });

    it("returns misconfigured URL error for ERR_INVALID_URL", async () => {
      // Create bridge with invalid URL that will cause ERR_INVALID_URL
      const invalidBridge = new StdioHttpBridge(
        "not-a-valid-url",
      ) as StdioHttpBridge & BridgeInternals;

      mockServer.connect.mockResolvedValue(undefined);
      await invalidBridge.start();

      // Get the most recent handler (from invalidBridge, not the beforeEach bridge)
      const callToolHandler = getHandler("CallToolRequestSchema", "last");

      const request = {
        params: {
          name: "test-tool",
          arguments: {},
        },
      };

      const result = await callToolHandler(request);

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
