// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGlobalContextMemory } from "#webui/hooks/context/use-global-context-memory";

// happy-dom defaults to http://localhost:3000/, so the same-origin endpoint
// resolves to localhost:3000/global-context.
const URL = "http://localhost:3000/global-context";

describe("useGlobalContextMemory", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("loads global context on mount via a no-store GET", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: "# global" }));

    const { result } = renderHook(() => useGlobalContextMemory());

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "# global",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("falls back to empty string when content is missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    const { result } = renderHook(() => useGlobalContextMemory());

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "",
      });
    });
  });

  it("reports an error when the GET is not ok", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );

    const { result } = renderHook(() => useGlobalContextMemory());

    await waitFor(() => {
      expect(result.current.status.kind).toBe("error");
    });

    expect(
      result.current.status.kind === "error" && result.current.status.message,
    ).toContain("Global context request failed");
  });

  it("save() PUTs the content and echoes the stored value", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: "" }));

    const { result } = renderHook(() => useGlobalContextMemory());

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ content: "saved\n" }));

    let ok: boolean | undefined;

    await act(async () => {
      ok = await result.current.save("saved\n");
    });

    expect(ok).toBe(true);
    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "saved\n",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      URL,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ content: "saved\n" }),
      }),
    );
  });

  it("save() surfaces an error when the PUT is not ok", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: "" }));

    const { result } = renderHook(() => useGlobalContextMemory());

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    fetchMock.mockResolvedValueOnce(
      new Response("nope", { status: 403, statusText: "Forbidden" }),
    );

    let ok: boolean | undefined;

    await act(async () => {
      ok = await result.current.save("attempt");
    });

    expect(ok).toBe(false);
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.saveError).toContain("Global context update failed");
  });

  it("save() echoes empty string when the PUT omits content", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: "x" }));

    const { result } = renderHook(() => useGlobalContextMemory());

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await act(async () => {
      await result.current.save("");
    });

    expect(result.current.status).toStrictEqual({ kind: "ready", content: "" });
  });
});
