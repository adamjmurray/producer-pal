// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared mock objects and assertion helpers for the stdio-to-HTTP bridge tests.
 *
 * The `vi.mock` calls themselves have to stay in the test file (they're hoisted
 * per-file), but their factories close over the mock objects here, so this
 * module owns them. Nothing reads a mock during module init — the factories
 * only dereference them when the mocked constructor is actually called — so
 * importing this from a test file that mocks the SDK is safe.
 */
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, vi, type Mock } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { type BridgeOptions } from "../portal-settings.ts";
import { StdioHttpBridge } from "../stdio-http-bridge.ts";

export const mockClient = {
  connect: vi.fn(),
  close: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
};

export const mockServer = {
  setRequestHandler: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  sendToolListChanged: vi.fn(),
};

export const mockTransport = {};

export const mockStandardTools = {
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
};

export const mockLiveApiTool = {
  "ppal-live-api": {
    title: "Live API",
    description: "Direct access to the Ableton Live Object Model.",
    inputSchema: { type: "object", properties: {} },
  },
};

/** The bridge's private surface, reached directly by the tests. */
export interface TestBridge {
  httpUrl: string;
  mcpServer: object | null;
  httpClient: object | null;
  isConnected: boolean;
  smallModelMode: boolean;
  fallbackTools: {
    tools: Array<{
      name: string;
      title?: string;
      description: string;
      inputSchema: object;
    }>;
  };
  start: () => Promise<void>;
  stop: () => Promise<void>;
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

/**
 * Get a registered handler from mockServer.setRequestHandler calls
 * @param schema - Schema name to find (e.g., "CallToolRequestSchema")
 * @param which - Which matching call to return
 * @returns The handler function
 */
export function getHandler(
  schema: string,
  which: "first" | "last" = "first",
): (request: unknown) => Promise<unknown> {
  const calls = (mockServer.setRequestHandler as Mock).mock.calls.filter(
    (c: unknown[]) => c[0] === schema,
  );

  return which === "last" ? calls.at(-1)?.[1] : calls[0]?.[1];
}

/**
 * Connect a fresh bridge built with `options` and assert the request headers it
 * gave its transport — or, when `expectedHeaders` is null, that it passed no
 * transport options at all. Also asserts nothing was POSTed to /config: these
 * settings are per-client, and a push would change them device-wide.
 * @param options - Bridge constructor options
 * @param expectedHeaders - Expected request headers, or null for none
 */
export async function expectRequestHeaders(
  options: BridgeOptions,
  expectedHeaders: Record<string, string> | null,
): Promise<void> {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}"));
  const testBridge = new StdioHttpBridge(
    "http://localhost:3350/mcp",
    options,
  ) as unknown as TestBridge;

  mockClient.connect.mockResolvedValue(undefined);

  await testBridge._ensureHttpConnection();

  const transportMock = StreamableHTTPClientTransport as unknown as Mock;

  expect(transportMock.mock.calls.at(-1)?.[1]).toStrictEqual(
    expectedHeaders == null
      ? undefined
      : { requestInit: { headers: expectedHeaders } },
  );
  expect(fetchSpy).not.toHaveBeenCalled();

  fetchSpy.mockRestore();
}

/**
 * Create a tool call request object for handler tests.
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns Request object
 */
export function callToolRequest(
  name = "test-tool",
  args: Record<string, unknown> = {},
): { params: { name: string; arguments: Record<string, unknown> } } {
  return { params: { name, arguments: args } };
}

/**
 * Start the bridge and return the call tool handler.
 * @param b - Bridge instance
 * @returns The CallToolRequestSchema handler
 */
export async function startAndGetCallHandler(
  b: TestBridge,
): Promise<(request: unknown) => Promise<unknown>> {
  mockServer.connect.mockResolvedValue(undefined);
  await b.start();

  return getHandler("CallToolRequestSchema");
}

/**
 * Assert that an error response's text contains common Producer Pal branding.
 * @param response - Error response object
 * @param response.content - Array of content items with type and text
 */
export function expectBrandedErrorText(response: {
  content: Array<{ type: string; text: string }>;
}): void {
  expect(response.content[0]?.text).toContain("producer-pal.org");
  expect(response.content[0]?.text).toContain(`(Producer Pal ${VERSION})`);
}

/**
 * Set up mocks for a successful tool call and invoke the handler.
 * @param handler - The call tool handler
 * @param request - The tool call request
 * @param request.params - The request parameters
 * @param request.params.name - The tool name
 * @param request.params.arguments - The tool arguments
 * @returns The tool result
 */
export async function callToolSuccessfully(
  handler: (request: unknown) => Promise<unknown>,
  request: { params: { name: string; arguments?: Record<string, unknown> } },
): Promise<unknown> {
  const toolResult = { content: [{ type: "text", text: "Success" }] };

  mockClient.connect.mockResolvedValue(undefined);
  mockClient.callTool.mockResolvedValue(toolResult);

  const result = await handler(request);

  return { result, toolResult };
}

/**
 * Create an MCP protocol error and set up mocks to reject with it.
 * @param handler - The call tool handler
 * @param message - Error message
 * @param code - MCP error code
 * @returns The call tool result cast with content and isError
 */
export async function callToolWithMcpError(
  handler: (request: unknown) => Promise<unknown>,
  message: string,
  code: number,
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const mcpError = new Error(message) as Error & { code: number };

  mcpError.code = code;

  mockClient.connect.mockResolvedValue(undefined);
  mockClient.callTool.mockRejectedValue(mcpError);

  return (await handler(callToolRequest())) as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
}
