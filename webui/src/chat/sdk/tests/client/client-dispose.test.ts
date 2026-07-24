// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, streamText: vi.fn(), generateText: vi.fn() };
});

vi.mock(import("#webui/chat/sdk/mcp-tools"), () => ({
  createMcpTools: vi.fn().mockResolvedValue({ tools: {}, mcpClient: {} }),
}));

vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: vi.fn(() => "http://localhost:3000/mcp"),
}));

import { ChatSdkClient } from "#webui/chat/sdk/client";
import { createConfig } from "#webui/chat/sdk/tests/client-test-helpers";

/**
 * Make createMcpTools resolve with an MCP client exposing the given close spy.
 * @param close - The close() spy to attach to the mock MCP client
 * @returns Promise resolving when the mock is configured
 */
async function stubMcpClientWithClose(
  close: ReturnType<typeof vi.fn>,
): Promise<void> {
  const { createMcpTools } = await import("#webui/chat/sdk/mcp-tools");

  (createMcpTools as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    tools: {},
    mcpClient: { close },
  });
}

describe("ChatSdkClient.dispose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes the MCP client captured during initialize", async () => {
    const close = vi.fn().mockResolvedValue(undefined);

    await stubMcpClientWithClose(close);

    const client = new ChatSdkClient("key", createConfig());

    await client.initialize();
    client.dispose();

    expect(close).toHaveBeenCalledOnce();
  });

  it("is a no-op before initialize", () => {
    const client = new ChatSdkClient("key", createConfig());

    // Never initialized — no client to close, must not throw.
    expect(() => client.dispose()).not.toThrow();
  });

  it("swallows a rejected close() and is idempotent", async () => {
    const close = vi.fn().mockRejectedValue(new Error("already closed"));

    await stubMcpClientWithClose(close);

    const client = new ChatSdkClient("key", createConfig());

    await client.initialize();

    // The rejection is caught internally; dispose never throws and a second
    // call is a no-op (the client is already nulled out).
    expect(() => client.dispose()).not.toThrow();
    client.dispose();

    expect(close).toHaveBeenCalledOnce();
  });
});
