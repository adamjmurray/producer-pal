// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGlobalSettings } from "#webui/hooks/connection/use-global-settings";
import { getSettingsUrl } from "#webui/utils/mcp-url";

describe("useGlobalSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the stored settings on mount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          autoUpdateCheck: false,
          dismissedUpdateVersion: null,
        }),
      ),
    );

    const { result } = renderHook(() => useGlobalSettings());

    await waitFor(() => {
      expect(result.current.autoUpdateCheck).toBe(false);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      getSettingsUrl(),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("defaults to checking enabled when the server can't be reached", async () => {
    // Opt-OUT: an unreachable server must not render the box unchecked and
    // imply the user had turned checking off.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useGlobalSettings());

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    expect(result.current.autoUpdateCheck).toBe(true);
  });

  it("writes a change through and reverts it when the write fails", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({})))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }));

    const { result } = renderHook(() => useGlobalSettings());

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    await act(() => {
      result.current.setAutoUpdateCheck(false);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      getSettingsUrl(),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ autoUpdateCheck: false }),
      }),
    );

    // The optimistic flip must not stick when the server refused it.
    await waitFor(() => {
      expect(result.current.autoUpdateCheck).toBe(true);
    });
  });
});
