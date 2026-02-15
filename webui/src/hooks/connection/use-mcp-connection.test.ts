// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the MCP SDK Client
const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockListTools = vi.fn();

// @ts-expect-error - Mock doesn't need full Client implementation
vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () => {
  return {
    Client: class MockClient {
      connect = mockConnect;
      close = mockClose;
      listTools = mockListTools;
    },
  };
});

vi.mock(import("@modelcontextprotocol/sdk/client/streamableHttp.js"), () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

import { useMcpConnection } from "./use-mcp-connection";

describe("useMcpConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockListTools.mockResolvedValue({
      tools: [
        { name: "ppal-session", title: "Session Management" },
        { name: "ppal-read-live-set", title: "Read Live Set" },
      ],
    });
  });

  it("starts in connecting state", () => {
    const { result } = renderHook(() => useMcpConnection());

    expect(result.current.mcpStatus).toBe("connecting");
    expect(result.current.mcpError).toBe(null);
    expect(result.current.mcpTools).toBe(null);
  });

  it("sets status to connected on successful connection", async () => {
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
    });
    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockListTools).toHaveBeenCalledOnce();
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("returns mcpTools on successful connection", async () => {
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpTools).toStrictEqual([
        { id: "ppal-session", name: "Session Management" },
        { id: "ppal-read-live-set", name: "Read Live Set" },
      ]);
    });
  });

  it("maps tool name to id and title to name", async () => {
    mockListTools.mockResolvedValue({
      tools: [{ name: "ppal-create-clip", title: "Create Clip" }],
    });
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpTools).toStrictEqual([
        { id: "ppal-create-clip", name: "Create Clip" },
      ]);
    });
  });

  it("falls back to tool.name when title is missing", async () => {
    mockListTools.mockResolvedValue({
      tools: [{ name: "ppal-unknown-tool" }],
    });
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpTools).toStrictEqual([
        { id: "ppal-unknown-tool", name: "ppal-unknown-tool" },
      ]);
    });
  });

  it("sets status to error on connection failure", async () => {
    const errorMessage = "Connection failed";

    mockConnect.mockRejectedValue(new Error(errorMessage));
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
      expect(result.current.mcpError).toBe(errorMessage);
      expect(result.current.mcpTools).toBe(null);
    });
  });

  it("sets error to 'Unknown error' when rejection is not an Error instance", async () => {
    mockConnect.mockRejectedValue("string error");
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
      expect(result.current.mcpError).toBe("Unknown error");
    });
  });

  it("allows manual reconnection via checkMcpConnection", async () => {
    mockConnect.mockRejectedValue(new Error("Initial fail"));
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
    });

    mockConnect.mockResolvedValue(undefined);
    await result.current.checkMcpConnection();

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
      expect(result.current.mcpTools).not.toBe(null);
    });
  });

  it("sets error when listTools fails", async () => {
    mockListTools.mockRejectedValue(new Error("listTools failed"));
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
      expect(result.current.mcpError).toBe("listTools failed");
      expect(result.current.mcpTools).toBe(null);
    });
  });
});
