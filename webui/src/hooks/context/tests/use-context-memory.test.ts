// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor, act } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContextMemory } from "#webui/hooks/context/use-context-memory";

// happy-dom defaults to http://localhost:3000/, so the same-origin /config
// endpoint resolves to localhost:3000.
const CONFIG_URL = "http://localhost:3000/config";

describe("useContextMemory", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockResponses(...responses: Array<object | Response>): void {
    for (const r of responses) {
      fetchMock.mockResolvedValueOnce(
        r instanceof Response ? r : jsonResponse(r),
      );
    }
  }

  async function callAndCapture(
    fn: () => Promise<boolean>,
  ): Promise<boolean | undefined> {
    let ok: boolean | undefined;

    await act(async () => {
      ok = await fn();
    });

    return ok;
  }

  it("loads memory content on mount", async () => {
    mockResponses({ memoryContent: "# hi" });

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "# hi",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      CONFIG_URL,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("reports error when fetch fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({
        kind: "error",
        message: "network down",
      });
    });
  });

  it("reports error when HTTP response is not ok", async () => {
    mockResponses(
      new Response("server boom", {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status.kind).toBe("error");
    });
  });

  it("save() posts content and updates status", async () => {
    mockResponses({ memoryContent: "old" }, { memoryContent: "new" });

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toMatchObject({ content: "old" });
    });

    const saved = await callAndCapture(() => result.current.save("new"));

    expect(saved).toBe(true);
    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "new",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      CONFIG_URL,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ memoryContent: "new" }),
      }),
    );
  });

  it("save() surfaces error from server", async () => {
    mockResponses(
      { memoryContent: "" },
      new Response("forbidden", { status: 403, statusText: "Forbidden" }),
    );

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    const saved = await callAndCapture(() => result.current.save("attempt"));

    expect(saved).toBe(false);
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.saveError).toContain("Config update failed");
  });

  it("clear() saves empty content", async () => {
    mockResponses({ memoryContent: "old" }, { memoryContent: "" });

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toMatchObject({ content: "old" });
    });

    await act(async () => {
      await result.current.clear();
    });

    expect(result.current.status).toMatchObject({ content: "" });
    expect(fetchMock).toHaveBeenLastCalledWith(
      CONFIG_URL,
      expect.objectContaining({
        body: JSON.stringify({ memoryContent: "" }),
      }),
    );
  });

  it("re-fetches on window focus so external writes surface", async () => {
    mockResponses({ memoryContent: "old" }, { memoryContent: "new" });

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toMatchObject({ content: "old" });
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      // Yield so the focus-triggered fetch can resolve.
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.status).toMatchObject({ content: "new" });
    });
  });

  it("refresh() re-reads memory", async () => {
    mockResponses({ memoryContent: "v1" }, { memoryContent: "v2" });

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toMatchObject({ content: "v1" });
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.status).toMatchObject({ content: "v2" });
  });

  it("falls back to empty string when memoryContent is missing", async () => {
    mockResponses({});

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "",
      });
    });
  });

  it("stringifies non-Error rejections", async () => {
    fetchMock.mockRejectedValueOnce("plain string error");

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({
        kind: "error",
        message: "plain string error",
      });
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
