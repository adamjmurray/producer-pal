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

/**
 * Render the hook and assert the opt-out default survives a failed read.
 * @returns Promise resolving when the assertion has run
 */
async function expectDefaultKept(): Promise<void> {
  const { result } = renderHook(() => useGlobalSettings());

  await waitFor(() => {
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  expect(result.current.autoUpdateCheck).toBe(true);
}

/**
 * Mount the hook, wait for its mount read, then turn auto-update-check off.
 * @param fetchSpy - The stubbed fetch, whose first call is the mount read
 * @returns The hook result, after the toggle
 */
async function mountAndToggleOff(fetchSpy: ReturnType<typeof vi.spyOn>) {
  const { result } = renderHook(() => useGlobalSettings());

  await waitFor(() => {
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  await act(() => {
    result.current.setAutoUpdateCheck(false);
  });

  return result;
}

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

    await expectDefaultKept();
  });

  it("keeps the default when the server answers the read with an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );

    await expectDefaultKept();
  });

  it("keeps a change that the server accepted", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({})));

    const result = await mountAndToggleOff(fetchSpy);

    expect(result.current.autoUpdateCheck).toBe(false);
  });

  it("reverts a change the write never reached the server with", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({})))
      .mockRejectedValueOnce(new Error("offline"));

    const result = await mountAndToggleOff(fetchSpy);

    await waitFor(() => {
      expect(result.current.autoUpdateCheck).toBe(true);
    });
  });

  it("writes a change through and reverts it when the write fails", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({})))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }));

    const result = await mountAndToggleOff(fetchSpy);

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
