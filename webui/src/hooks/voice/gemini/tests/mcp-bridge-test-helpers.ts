// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { vi } from "vitest";
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
