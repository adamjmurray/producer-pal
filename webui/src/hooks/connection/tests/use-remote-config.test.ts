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
 * @returns Mock Response
 */
function mockConfigResponse(config: { smallModelMode: boolean }): Response {
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
