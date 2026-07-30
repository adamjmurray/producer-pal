// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUpdateCheck } from "#webui/hooks/use-update-check";
import { getUpdateUrl } from "#webui/utils/mcp-url";

/**
 * Stub the /update transport with a single response.
 * @param response - What fetch resolves to
 * @returns The fetch spy
 */
function mockFetch(response: Response): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

describe("useUpdateCheck", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the server's cached check, never GitHub", async () => {
    // GitHub's unauthenticated limit is per IP and this hook remounts on every
    // chat-window open, so it must stay on the local route. The server made the
    // one GitHub request at startup (src/mcp-server/update-check.ts).
    const fetchSpy = mockFetch(
      new Response(JSON.stringify({ version: "2.0.0" })),
    );

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(result.current).toStrictEqual({ version: "2.0.0" });
    });

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

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    expect(result.current).toBeNull();
  });

  it("stays silent when the endpoint errors", async () => {
    mockFetch(new Response("nope", { status: 500 }));

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    expect(result.current).toBeNull();
  });

  it("stays silent when the fetch rejects", async () => {
    // The badge is decoration: a server that isn't answering must not surface
    // an error anywhere in the chat header.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    expect(result.current).toBeNull();
  });
});
