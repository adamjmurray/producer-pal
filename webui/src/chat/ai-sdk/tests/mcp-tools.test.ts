// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock MCP client helpers
vi.mock(import("#webui/chat/helpers/mcp-client-helpers"), () => ({
  createConnectedMcpClient: vi.fn(),
  filterEnabledTools: vi.fn((tools) => tools),
}));

import {
  createConnectedMcpClient,
  filterEnabledTools,
} from "#webui/chat/helpers/mcp-client-helpers";
import { createAiSdkMcpTools } from "#webui/chat/ai-sdk/mcp-tools";

describe("createAiSdkMcpTools", () => {
  const mockTools = [
    {
      name: "ppal-connect",
      description: "Connect to Ableton",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "ppal-read",
      description: "Read the Live Set",
      inputSchema: {
        type: "object" as const,
        properties: {
          trackId: { type: "string" as const },
        },
      },
    },
  ];

  const mockCallTool = vi.fn().mockResolvedValue({ content: "result" });

  beforeEach(() => {
    vi.clearAllMocks();
    (createConnectedMcpClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      listTools: vi.fn().mockResolvedValue({ tools: mockTools }),
      callTool: mockCallTool,
    });
  });

  it("creates AI SDK tools from MCP server", async () => {
    const { tools } = await createAiSdkMcpTools("http://localhost:3000/mcp");

    expect(Object.keys(tools)).toStrictEqual(["ppal-connect", "ppal-read"]);
  });

  it("connects to MCP server with the given URL", async () => {
    await createAiSdkMcpTools("http://custom:9000/mcp");

    expect(createConnectedMcpClient).toHaveBeenCalledWith(
      "http://custom:9000/mcp",
    );
  });

  it("filters tools based on enabledTools map", async () => {
    const enabledTools = { "ppal-connect": true, "ppal-read": false };

    await createAiSdkMcpTools("http://localhost:3000/mcp", enabledTools);

    expect(filterEnabledTools).toHaveBeenCalledWith(mockTools, enabledTools);
  });

  it("sets tool descriptions", async () => {
    const { tools } = await createAiSdkMcpTools("http://localhost:3000/mcp");

    expect(tools["ppal-connect"]!.description).toBe("Connect to Ableton");
    expect(tools["ppal-read"]!.description).toBe("Read the Live Set");
  });

  it("creates executable tools that call mcpClient.callTool", async () => {
    const { tools } = await createAiSdkMcpTools("http://localhost:3000/mcp");

    const execute = tools["ppal-connect"]!.execute!;
    const result = await execute(
      { arg: "value" },
      {
        toolCallId: "tc1",
        messages: [],
        abortSignal: new AbortController().signal,
      },
    );

    expect(mockCallTool).toHaveBeenCalledWith({
      name: "ppal-connect",
      arguments: { arg: "value" },
    });
    expect(result).toBe("result");
  });

  it("returns the MCP client", async () => {
    const { mcpClient } = await createAiSdkMcpTools(
      "http://localhost:3000/mcp",
    );

    expect(mcpClient).toBeDefined();
    expect(mcpClient).toHaveProperty("listTools");
  });
});
