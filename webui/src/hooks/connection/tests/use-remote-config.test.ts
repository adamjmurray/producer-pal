// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";

/**
 * Creates a mock Response with the given config
 * @param config - Config object to return as JSON
 * @param config.smallModelMode - Whether small model mode is enabled
 * @param config.liveApiEnabled - Whether Live API tool is enabled
 * @returns Mock Response
 */
function mockConfigResponse(config: {
  smallModelMode: boolean;
  liveApiEnabled?: boolean;
}): Response {
  return {
    ok: true,
    json: () => Promise.resolve(config),
  } as Response;
}

describe("useRemoteConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults serverSmallModelMode to false", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ smallModelMode: false }),
    );
    const { result } = renderHook(() => useRemoteConfig("connecting"));

    expect(result.current.serverSmallModelMode).toBe(false);
  });

  it("fetches config on mount", async () => {
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockConfigResponse({ smallModelMode: true }));

    const { result } = renderHook(() => useRemoteConfig("connecting"));

    await waitFor(() => {
      expect(result.current.serverSmallModelMode).toBe(true);
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/config"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("re-fetches when mcpStatus changes to connected", async () => {
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockConfigResponse({ smallModelMode: true }));

    const { result, rerender } = renderHook(
      ({ status }: { status: McpStatus }) => useRemoteConfig(status),
      { initialProps: { status: "connecting" as McpStatus } },
    );

    await waitFor(() => {
      expect(result.current.serverSmallModelMode).toBe(true);
    });

    mockFetch.mockResolvedValue(mockConfigResponse({ smallModelMode: false }));
    rerender({ status: "connected" });

    await waitFor(() => {
      expect(result.current.serverSmallModelMode).toBe(false);
    });
  });

  it("re-fetches on window focus", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ smallModelMode: false }),
    );

    const { result } = renderHook(() => useRemoteConfig("connected"));

    await waitFor(() => {
      expect(result.current.serverSmallModelMode).toBe(false);
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ smallModelMode: true }),
    );

    await act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(result.current.serverSmallModelMode).toBe(true);
    });
  });

  it("POSTs to config endpoint when postSmallModelMode called", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ smallModelMode: false }),
    );

    const { result } = renderHook(() => useRemoteConfig("connected"));

    await waitFor(() => {
      expect(result.current.serverSmallModelMode).toBe(false);
    });

    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockConfigResponse({ smallModelMode: true }));

    await act(() => {
      result.current.postSmallModelMode(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/config"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ smallModelMode: true }),
      }),
    );
  });

  it("keeps default state when response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
    } as Response);

    const { result } = renderHook(() => useRemoteConfig("connected"));

    // Wait for the fetch to resolve, then verify state stayed at default
    await waitFor(() => {
      expect(result.current.serverSmallModelMode).toBe(false);
    });
  });

  it("handles fetch error on mount gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useRemoteConfig("connected"));

    // Should stay at default, not throw
    await waitFor(() => {
      expect(result.current.serverSmallModelMode).toBe(false);
    });
  });

  it("defaults serverLiveApiEnabled to false", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ smallModelMode: false }),
    );
    const { result } = renderHook(() => useRemoteConfig("connecting"));

    expect(result.current.serverLiveApiEnabled).toBe(false);
  });

  it("fetches serverLiveApiEnabled on mount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ smallModelMode: false, liveApiEnabled: true }),
    );

    const { result } = renderHook(() => useRemoteConfig("connecting"));

    await waitFor(() => {
      expect(result.current.serverLiveApiEnabled).toBe(true);
    });
  });

  it("postLiveApiEnabled POSTs the new value, then focus refetch updates serverLiveApiEnabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ smallModelMode: false, liveApiEnabled: false }),
    );

    const { result } = renderHook(() => useRemoteConfig("connected"));

    await waitFor(() => {
      expect(result.current.serverLiveApiEnabled).toBe(false);
    });

    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        mockConfigResponse({ smallModelMode: false, liveApiEnabled: true }),
      );

    await act(async () => {
      await result.current.postLiveApiEnabled(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/config"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ liveApiEnabled: true }),
      }),
    );
    expect(result.current.serverLiveApiEnabled).toBe(true);

    // Focus refetch picks up a device-side change (server now reports false again)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ smallModelMode: false, liveApiEnabled: false }),
    );

    await act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(result.current.serverLiveApiEnabled).toBe(false);
    });
  });

  it("postLiveApiEnabled resolves even when fetch rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useRemoteConfig("connected"));

    await act(async () => {
      await expect(
        result.current.postLiveApiEnabled(true),
      ).resolves.toBeUndefined();
    });
  });

  it("postLiveApiEnabled reverts optimistic state when POST returns non-OK", async () => {
    // Initial fetch resolves with liveApiEnabled=false so the hook seeds.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ smallModelMode: false, liveApiEnabled: false }),
    );

    const { result } = renderHook(() => useRemoteConfig("connected"));

    await waitFor(() => {
      expect(result.current.serverLiveApiEnabled).toBe(false);
    });

    // POST returns 400; refetch revert returns the authoritative server
    // state (still false). The optimistic update flips to true then snaps
    // back when the refetch resolves.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      if ((init as RequestInit | undefined)?.method === "POST") {
        return Promise.resolve({ ok: false, status: 400 } as Response);
      }

      return Promise.resolve(
        mockConfigResponse({ smallModelMode: false, liveApiEnabled: false }),
      );
    });

    await act(async () => {
      await result.current.postLiveApiEnabled(true);
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("returned 400"),
    );
    expect(result.current.serverLiveApiEnabled).toBe(false);
  });

  it("cleans up focus listener on unmount", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ smallModelMode: false }),
    );
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useRemoteConfig("connecting"));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("focus", expect.any(Function));
  });
});
