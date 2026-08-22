// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
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

const mockIsViteDevServer = vi.fn<() => boolean>(() => false);
const mockDetectCorsBlock = vi.fn<(url: string) => Promise<boolean>>(() =>
  Promise.resolve(false),
);

vi.mock(import("#webui/utils/mcp-url"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    isViteDevServer: () => mockIsViteDevServer(),
    detectCorsBlock: (url: string) => mockDetectCorsBlock(url),
  };
});

import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";

/**
 * Render the hook and wait for it to settle on a status.
 * @param status - The status to wait for
 * @returns The hook result handle
 */
async function renderUntilStatus(status: "connected" | "error") {
  const { result } = renderHook(() => useMcpConnection());

  await waitFor(() => {
    expect(result.current.mcpStatus).toBe(status);
  });

  return result;
}

/**
 * Render the hook and assert it reports a connection error.
 * @param message - The user-facing error text it must land on
 * @returns The hook result handle
 */
async function expectConnectionError(message: string) {
  const { result } = renderHook(() => useMcpConnection());

  await waitFor(() => {
    expect(result.current.mcpStatus).toBe("error");
    expect(result.current.mcpError).toBe(message);
  });

  return result;
}

describe("useMcpConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsViteDevServer.mockReturnValue(false);
    mockDetectCorsBlock.mockResolvedValue(false);
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockListTools.mockResolvedValue({
      tools: [
        { name: "ppal-connect", title: "Connect to Ableton" },
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
    await renderUntilStatus("connected");
    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockListTools).toHaveBeenCalledOnce();
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("returns mcpTools on successful connection", async () => {
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpTools).toStrictEqual([
        {
          id: "ppal-connect",
          name: "Connect to Ableton",
          description: undefined,
        },
        {
          id: "ppal-read-live-set",
          name: "Read Live Set",
          description: undefined,
        },
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
        { id: "ppal-create-clip", name: "Create Clip", description: undefined },
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
        {
          id: "ppal-unknown-tool",
          name: "ppal-unknown-tool",
          description: undefined,
        },
      ]);
    });
  });

  it("sets status to error on connection failure", async () => {
    const errorMessage = "Connection failed";

    mockConnect.mockRejectedValue(new Error(errorMessage));
    const result = await expectConnectionError(errorMessage);

    expect(result.current.mcpTools).toBe(null);
  });

  it("sets error to 'Unknown error' when rejection is not an Error instance", async () => {
    mockConnect.mockRejectedValue("string error");
    await expectConnectionError("Unknown error");
  });

  it("allows manual reconnection via checkMcpConnection", async () => {
    mockConnect.mockRejectedValue(new Error("Initial fail"));
    const result = await renderUntilStatus("error");

    mockConnect.mockResolvedValue(undefined);
    await result.current.checkMcpConnection();

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
      expect(result.current.mcpTools).not.toBe(null);
    });
  });

  it("sets error when listTools fails", async () => {
    mockListTools.mockRejectedValue(new Error("listTools failed"));
    const result = await expectConnectionError("listTools failed");

    expect(result.current.mcpTools).toBe(null);
  });

  it("closes the client even when listTools throws", async () => {
    mockListTools.mockRejectedValue(new Error("listTools failed"));
    await renderUntilStatus("error");

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("swallows close() failures so they don't leak as the user-facing error", async () => {
    mockClose.mockRejectedValue(new Error("close failed"));
    const result = await renderUntilStatus("connected");

    expect(result.current.mcpError).toBe(null);
  });

  it("shows CORS hint when on Vite dev server and server is reachable", async () => {
    mockConnect.mockRejectedValue(new Error("Failed to fetch"));
    mockIsViteDevServer.mockReturnValue(true);
    mockDetectCorsBlock.mockResolvedValue(true);
    const { result } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("error");
      expect(result.current.mcpError).toContain("Rebuild in dev mode");
    });
  });

  it("shows generic error when on Vite dev server but server is unreachable", async () => {
    mockConnect.mockRejectedValue(new Error("Failed to fetch"));
    mockIsViteDevServer.mockReturnValue(true);
    mockDetectCorsBlock.mockResolvedValue(false);
    await expectConnectionError("Failed to fetch");
  });

  it("does not check for CORS when not on Vite dev server", async () => {
    mockConnect.mockRejectedValue(new Error("Connection failed"));
    mockIsViteDevServer.mockReturnValue(false);
    await expectConnectionError("Connection failed");

    expect(mockDetectCorsBlock).not.toHaveBeenCalled();
  });

  it("refreshes mcpTools on window focus when connected", async () => {
    const result = await renderUntilStatus("connected");

    expect(mockListTools).toHaveBeenCalledTimes(1);

    // Device-side change: liveApiEnabled flipped on; tool list now includes
    // ppal-live-api.
    mockListTools.mockResolvedValue({
      tools: [
        { name: "ppal-connect", title: "Connect to Ableton" },
        { name: "ppal-read-live-set", title: "Read Live Set" },
        { name: "ppal-live-api", title: "Live API" },
      ],
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      // Yield so the focus-triggered fetch can resolve.
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.mcpTools).toHaveLength(3);
    });

    expect(result.current.mcpStatus).toBe("connected");
    expect(mockListTools).toHaveBeenCalledTimes(2);
  });

  it("skips focus refresh when not yet connected", async () => {
    // Slow the initial connect so the focus event fires before mount-fetch
    // completes; the listener should bail because status is still
    // "connecting".
    let resolveConnect: () => void = () => {};

    mockConnect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        }),
    );

    renderHook(() => useMcpConnection());

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    // No extra listTools call from the focus event during "connecting".
    expect(mockListTools).not.toHaveBeenCalled();

    // Let the mount-fetch finish so the test cleanup doesn't hang.
    resolveConnect();
  });

  it("preserves connected status and prior tools when focus refresh fails", async () => {
    const result = await renderUntilStatus("connected");

    const priorTools = result.current.mcpTools;

    // Next listTools (triggered by focus) fails; status must NOT flip to
    // "error" — a transient refresh failure isn't a disconnect.
    mockListTools.mockRejectedValueOnce(new Error("transient blip"));

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    // Yield one more tick for the rejection path.
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.mcpStatus).toBe("connected");
    expect(result.current.mcpError).toBe(null);
    expect(result.current.mcpTools).toStrictEqual(priorTools);
  });

  it("discards a stale focus-refresh result when a later refresh resolves first", async () => {
    const result = await renderUntilStatus("connected");

    const initialTools = result.current.mcpTools;

    // Two focus events fire in quick succession. The first listTools call
    // resolves AFTER the second (slow-then-fast). Without the seq guard, the
    // first response would stomp the fresh second one.
    let resolveSlow: (value: { tools: unknown[] }) => void = () => {};
    let resolveFast: (value: { tools: unknown[] }) => void = () => {};

    mockListTools
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSlow = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFast = resolve;
          }),
      );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
    });

    // Wait until both focus-triggered listTools calls have started (mount
    // was the first call; the two focuses bring the total to 3) so both
    // mockImplementationOnce slots have been claimed.
    await waitFor(() => {
      expect(mockListTools).toHaveBeenCalledTimes(3);
    });

    // Resolve the second (fast) refresh first — this is the fresh result.
    await act(async () => {
      resolveFast({
        tools: [
          { name: "ppal-connect", title: "Connect to Ableton" },
          { name: "ppal-read-live-set", title: "Read Live Set" },
          { name: "ppal-live-api", title: "Live API" },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.mcpTools).toHaveLength(3);
    });

    // Now resolve the first (slow) refresh with a STALE tool list. The seq
    // guard must discard this; tools must remain at the fresh count.
    await act(async () => {
      resolveSlow({
        tools: [{ name: "ppal-connect", title: "Connect to Ableton" }],
      });
    });

    expect(result.current.mcpTools).toHaveLength(3);
    expect(result.current.mcpTools).not.toStrictEqual(initialTools);
  });

  it("removes the focus listener on unmount", async () => {
    const { result, unmount } = renderHook(() => useMcpConnection());

    await waitFor(() => {
      expect(result.current.mcpStatus).toBe("connected");
    });

    const callsBefore = mockListTools.mock.calls.length;

    unmount();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(mockListTools.mock.calls).toHaveLength(callsBefore);
  });
});
