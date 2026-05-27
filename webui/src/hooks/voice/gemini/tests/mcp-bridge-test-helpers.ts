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

export const callToolMock = vi.fn();
export const listToolsMock = vi.fn();
export const closeMock = vi.fn();

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
  createConnectedMcpClient: () => Promise<Client>;
  filterEnabledTools: (
    tools: McpToolDefinition[],
    enabledTools?: Record<string, boolean>,
  ) => McpToolDefinition[];
} {
  return {
    createConnectedMcpClient: vi.fn(async () => fakeMcpClient),
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
}

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
