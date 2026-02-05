// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the MCP SDK Client
const mockConnect = vi.fn();
const mockClose = vi.fn();

// @ts-expect-error - Mock doesn't need full Client implementation
vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () => {
  return {
    Client: class MockClient {
      connect = mockConnect;
      close = mockClose;
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
  });

  it("starts in connecting state", () => {
    const { result } = renderHook(() => useMcpConnection());

    expect(result.current.mcpStatus).toBe("connecting");
    expect(result.current.mcpError).toBe(null);
  });

  it("sets status to connected on successful connection", async () => {
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
    });
    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("sets status to error on connection failure", async () => {
    const errorMessage = "Connection failed";

    mockConnect.mockRejectedValue(new Error(errorMessage));
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
      expect(result.current.mcpError).toBe(errorMessage);
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
    });
  });
});
