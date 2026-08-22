// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { expect, it, vi } from "vitest";
import { CLIENT_TOOL_TIMEOUT_MS } from "#src/shared/config";
import { type McpToolDefinition } from "#webui/chat/helpers/mcp-client-helpers";

// Shared MCP-client mock scaffold for the voice tool-bridge tests (OpenAI
// Realtime + Gemini Live). Both bridges build on the same mcp-client-helpers, so
// they share one fake client + one vi.mock factory rather than duplicating the
// setup in each test file.
//
// Only mcp-client-helpers is mocked. connectAndListTools is left real, so each
// bridge's close-on-catalog-failure path is genuinely exercised — which is also
// why it lives in its own module: a mock can't intercept a same-module call.

export const callToolMock = vi.fn();
export const listToolsMock = vi.fn();
export const closeMock = vi.fn();
export const createConnectedMcpClientMock = vi.fn();

export const fakeMcpClient = {
  callTool: callToolMock,
  listTools: listToolsMock,
  close: closeMock,
} as unknown as Client;

/**
 * Factory for `vi.mock("#webui/chat/helpers/mcp-client-helpers")` — returns the
 * fake client and a passthrough filterEnabledTools.
 * @returns The mocked module shape
 */
export function mcpClientHelpersMock(): {
  createConnectedMcpClient: typeof createConnectedMcpClientMock;
  filterEnabledTools: (
    tools: McpToolDefinition[],
    enabledTools?: Record<string, boolean>,
  ) => McpToolDefinition[];
} {
  return {
    createConnectedMcpClient: createConnectedMcpClientMock,
    filterEnabledTools: (tools, enabledTools) =>
      enabledTools
        ? tools.filter((t) => enabledTools[t.name] !== false)
        : tools,
  };
}

/** Reset all MCP-client mocks (call from afterEach). */
export function resetMcpClientMocks(): void {
  callToolMock.mockReset();
  listToolsMock.mockReset();
  closeMock.mockReset();
  createConnectedMcpClientMock.mockReset();
  applyMcpClientDefaults();
}

/** The defaults every test starts from: connect resolves, close resolves. */
function applyMcpClientDefaults(): void {
  createConnectedMcpClientMock.mockResolvedValue(fakeMcpClient);
  // The real close() returns a promise, and the bridges chain .catch() onto it.
  closeMock.mockResolvedValue(undefined);
}

applyMcpClientDefaults();

/**
 * Queue a `listTools()` response that returns the named bare tools (no input
 * schema beyond `{ properties: {} }`).
 * @param names - Tool names to expose
 */
export function mockListBareTools(...names: string[]): void {
  listToolsMock.mockResolvedValueOnce({
    tools: names.map((name) => ({
      name,
      description: "",
      inputSchema: { properties: {} },
    })),
  });
}

/**
 * Queue the two-tool `listTools()` response both adapter suites map: one tool
 * with a full schema, and one whose schema omits `type` and `required` so the
 * adapter has to supply them.
 * @param firstSchemaExtras - Extra keys merged into the first tool's inputSchema
 */
export function mockListTwoTools(
  firstSchemaExtras: Record<string, unknown> = {},
): void {
  listToolsMock.mockResolvedValueOnce({
    tools: [
      {
        name: "ppal-read-track",
        description: "Read a track",
        inputSchema: {
          ...firstSchemaExtras,
          type: "object",
          properties: { trackIndex: { type: "number" } },
          required: ["trackIndex"],
        },
      },
      {
        name: "ppal-create-clip",
        description: "Create a clip",
        inputSchema: { properties: {} },
      },
    ],
  });
}

/**
 * Queue a successful `callTool()` response of text segments that will flatten
 * into the joined string when the bridge stringifies them.
 * @param texts - Text segments
 */
export function mockCallToolText(...texts: string[]): void {
  callToolMock.mockResolvedValueOnce({
    isError: false,
    content: texts.map((text) => ({ type: "text", text })),
  });
}

const CATALOG_FAILURE = "catalog unavailable";

/**
 * The tests both voice bridges own, differing only in which factory they call:
 * the toolset reaches the server as a header, a failed catalog read closes the
 * transport, and a close that also fails doesn't mask the original error. The
 * close matters because each caller stores `mcpClient` only once the factory
 * resolves — a throw past a successful connect otherwise leaks an open
 * transport, one more on every Talk retry. Registers inside the caller's
 * describe block.
 * @param mcpUrl - The MCP URL each call passes
 * @param createTools - The bridge factory under test
 */
export function registerSharedBridgeTests(
  mcpUrl: string,
  createTools: (
    url: string,
    enabledTools?: Record<string, boolean>,
  ) => Promise<unknown>,
): void {
  it("sends the toolset to the server, but no small-model mode or notation", async () => {
    mockListBareTools("ppal-a");

    const enabledTools = { "ppal-a": true, "ppal-b": false };

    await createTools(mcpUrl, enabledTools);

    // The disabled-tools header is what stops the server from shipping skills
    // fragments for tools voice can't call. The two undefineds keep voice on the
    // device globals for small-model mode and notation.
    expect(createConnectedMcpClientMock).toHaveBeenCalledWith(
      mcpUrl,
      undefined,
      enabledTools,
      undefined,
    );
  });

  it("closes the connection when the catalog read fails", async () => {
    listToolsMock.mockRejectedValueOnce(new Error(CATALOG_FAILURE));

    await expect(createTools(mcpUrl)).rejects.toThrow(CATALOG_FAILURE);
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it("reports the original failure even when the close fails too", async () => {
    listToolsMock.mockRejectedValueOnce(new Error(CATALOG_FAILURE));
    closeMock.mockRejectedValueOnce(new Error("socket already gone"));

    await expect(createTools(mcpUrl)).rejects.toThrow(CATALOG_FAILURE);
  });
}

/**
 * Assert the bridge forwarded one tool call to `mcpClient.callTool`, capped by
 * the shared client-tool deadline.
 * @param name - The MCP tool name it should have called
 * @param args - The arguments it should have forwarded
 */
export function expectForwardedCall(name: string, args: unknown): void {
  expect(callToolMock).toHaveBeenCalledWith(
    { name, arguments: args },
    undefined,
    {
      timeout: CLIENT_TOOL_TIMEOUT_MS,
    },
  );
}
