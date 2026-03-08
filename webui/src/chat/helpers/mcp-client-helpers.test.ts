// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createConnectedMcpClient,
  filterEnabledTools,
  type McpToolDefinition,
} from "#webui/chat/helpers/mcp-client-helpers";

const mockConnect = vi.fn().mockResolvedValue(undefined);

// @ts-expect-error - Mock doesn't need full Client implementation
vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () => ({
  Client: class MockClient {
    connect = mockConnect;
  },
}));

vi.mock(import("@modelcontextprotocol/sdk/client/streamableHttp.js"), () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

const tools: McpToolDefinition[] = [
  { name: "tool-a", inputSchema: {} },
  { name: "tool-b", inputSchema: {} },
  { name: "tool-c", inputSchema: {} },
];

describe("filterEnabledTools", () => {
  it("returns all tools when enabledTools is undefined", () => {
    expect(filterEnabledTools(tools)).toStrictEqual(tools);
  });

  it("filters out explicitly disabled tools", () => {
    const result = filterEnabledTools(tools, { "tool-b": false });

    expect(result).toStrictEqual([tools[0], tools[2]]);
  });

  it("keeps tools that are explicitly enabled", () => {
    const result = filterEnabledTools(tools, {
      "tool-a": true,
      "tool-b": false,
    });

    expect(result).toStrictEqual([tools[0], tools[2]]);
  });

  it("returns empty array when all tools are disabled", () => {
    const result = filterEnabledTools(tools, {
      "tool-a": false,
      "tool-b": false,
      "tool-c": false,
    });

    expect(result).toStrictEqual([]);
  });
});

describe("createConnectedMcpClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates and connects an MCP client", async () => {
    const client = await createConnectedMcpClient("http://localhost:3000/mcp");

    expect(client).toBeDefined();
    expect(mockConnect).toHaveBeenCalledOnce();
  });
});
