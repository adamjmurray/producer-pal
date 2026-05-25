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

  it("loads memory content on mount", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        memoryEnabled: true,
        memoryContent: "# hi",
      }),
    );

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

  it("reports disabled status when memory is off", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        memoryEnabled: false,
        memoryContent: "ignored",
      }),
    );

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({ kind: "disabled" });
    });
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
    fetchMock.mockResolvedValueOnce(
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
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ memoryEnabled: true, memoryContent: "old" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ memoryEnabled: true, memoryContent: "new" }),
      );

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toMatchObject({ content: "old" });
    });

    await act(async () => {
      await result.current.save("new");
    });

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
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ memoryEnabled: true, memoryContent: "" }),
      )
      .mockResolvedValueOnce(
        new Response("forbidden", {
          status: 403,
          statusText: "Forbidden",
        }),
      );

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    await act(async () => {
      await result.current.save("attempt");
    });

    expect(result.current.saveStatus).toBe("error");
    expect(result.current.saveError).toContain("Config update failed");
  });

  it("refresh() re-reads memory", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ memoryEnabled: true, memoryContent: "v1" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ memoryEnabled: true, memoryContent: "v2" }),
      );

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
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        memoryEnabled: true,
      }),
    );

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
