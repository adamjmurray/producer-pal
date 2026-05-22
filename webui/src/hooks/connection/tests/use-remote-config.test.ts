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
import {
  mockConfigResponse,
  setupRemoteConfigHook,
} from "./use-remote-config-test-helpers";

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
    const { result } = await setupRemoteConfigHook({ smallModelMode: false });

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
    const { result } = await setupRemoteConfigHook({ smallModelMode: false });

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
    const { result } = await setupRemoteConfigHook({
      smallModelMode: false,
      liveApiEnabled: false,
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
    const { result } = await setupRemoteConfigHook({
      smallModelMode: false,
      liveApiEnabled: false,
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

  it("skips failure revert when a newer POST has been initiated", async () => {
    const { result } = await setupRemoteConfigHook({
      smallModelMode: false,
      liveApiEnabled: false,
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // POST #1 is held pending so we can fail it AFTER POST #2 has run.
    // The refetch mock simulates stale server state (still reflecting
    // POST #1's intent of true) — if the guard fails, the revert would
    // write `true` back over POST #2's optimistic `false`.
    let resolvePost1: (() => void) | null = null;
    const post1Pending = new Promise<Response>((resolve) => {
      resolvePost1 = () => resolve({ ok: false, status: 500 } as Response);
    });

    let postCount = 0;
    let refetchCount = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const method = (init as RequestInit | undefined)?.method;

      if (method === "POST") {
        postCount++;

        if (postCount === 1) return post1Pending;

        return Promise.resolve({ ok: true } as Response);
      }

      refetchCount++;

      return Promise.resolve(
        mockConfigResponse({ smallModelMode: false, liveApiEnabled: true }),
      );
    });

    let post1Promise!: Promise<void>;

    await act(() => {
      post1Promise = result.current.postLiveApiEnabled(true);
    });
    expect(result.current.serverLiveApiEnabled).toBe(true);

    await act(async () => {
      await result.current.postLiveApiEnabled(false);
    });
    expect(result.current.serverLiveApiEnabled).toBe(false);

    await act(async () => {
      resolvePost1!();
      await post1Promise;
    });

    expect(refetchCount).toBe(0);
    expect(result.current.serverLiveApiEnabled).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("skipping revert"),
    );
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
