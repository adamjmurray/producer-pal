// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUpdateCheck } from "#webui/hooks/connection/use-update-check";
import { getSettingsUrl, getUpdateUrl } from "#webui/utils/mcp-url";

/**
 * Stub the /update transport with a single response.
 * @param response - What fetch resolves to
 * @returns The fetch spy
 */
function mockFetch(response: Response): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

/**
 * Render the hook against an /update that announces 2.0.0, and wait for it.
 * @returns The hook result and the fetch spy
 */
async function renderWithUpdateAvailable() {
  const fetchSpy = mockFetch(
    new Response(JSON.stringify({ version: "2.0.0" })),
  );
  const { result } = renderHook(() => useUpdateCheck());

  await waitFor(() => {
    expect(result.current.update).toStrictEqual({ version: "2.0.0" });
  });

  return { result, fetchSpy };
}

/**
 * Render the hook and assert no update surfaces once the fetch has settled.
 * @returns Promise resolving when the assertion has run
 */
async function expectNoUpdate(): Promise<void> {
  const { result } = renderHook(() => useUpdateCheck());

  await waitFor(() => {
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  expect(result.current.update).toBeNull();
}

describe("useUpdateCheck", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the server's cached check, never GitHub", async () => {
    // GitHub's unauthenticated limit is per IP and this hook remounts on every
    // chat-window open, so it must stay on the local route. The server made the
    // one GitHub request at startup (src/mcp-server/update-check.ts).
    const { fetchSpy } = await renderWithUpdateAvailable();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Through the shared URL builder, not a bare "/update": on the Vite dev
    // server (port 5173, no proxy) a same-origin path 404s and the badge silently
    // never appears. Every sibling endpoint goes through mcp-url for this reason.
    expect(fetchSpy).toHaveBeenCalledWith(
      getUpdateUrl(),
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(getUpdateUrl()).toMatch(/\/update$/);
  });

  it("returns null when the server reports no update", async () => {
    // The endpoint answers with a literal `null` body.
    mockFetch(new Response("null"));

    await expectNoUpdate();
  });

  it("stays silent when the endpoint errors", async () => {
    mockFetch(new Response("nope", { status: 500 }));

    await expectNoUpdate();
  });

  it("stays silent when the fetch rejects", async () => {
    // The badge is decoration: a server that isn't answering must not surface
    // an error anywhere in the chat header.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expectNoUpdate();
  });

  it("records a dismissal server-side so the device honors it too", async () => {
    // Not localStorage: the Max for Live device shows its own notification and
    // reads the same /update answer, so the dismissal has to live where both
    // surfaces can see it.
    const { result, fetchSpy } = await renderWithUpdateAvailable();

    await act(() => {
      result.current.dismissUpdate();
    });

    expect(result.current.update).toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith(
      getSettingsUrl(),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ dismissedUpdateVersion: "2.0.0" }),
      }),
    );
  });

  it("writes nothing when dismissing with no update showing", async () => {
    const fetchSpy = mockFetch(new Response(JSON.stringify({ version: null })));
    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    await act(() => {
      result.current.dismissUpdate();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
