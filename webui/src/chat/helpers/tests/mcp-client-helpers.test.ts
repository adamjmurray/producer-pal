// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SMALL_MODEL_MODE_HEADER } from "#src/shared/config";
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

const mockTransport = vi.mocked(StreamableHTTPClientTransport);

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

  it("sends no per-request header when smallModelMode is omitted", async () => {
    await createConnectedMcpClient("http://localhost:3000/mcp");

    // Voice paths omit the flag and must fall back to the global config value.
    expect(mockTransport.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("sends the small-model-mode header true when enabled", async () => {
    await createConnectedMcpClient("http://localhost:3000/mcp", true);

    expect(
      mockTransport.mock.calls[0]?.[1]?.requestInit?.headers,
    ).toStrictEqual({ [SMALL_MODEL_MODE_HEADER]: "true" });
  });

  it("sends the small-model-mode header false when explicitly disabled", async () => {
    // Explicit false is authoritative for this caller, overriding the global.
    await createConnectedMcpClient("http://localhost:3000/mcp", false);

    expect(
      mockTransport.mock.calls[0]?.[1]?.requestInit?.headers,
    ).toStrictEqual({ [SMALL_MODEL_MODE_HEADER]: "false" });
  });
});
