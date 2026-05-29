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

  // A focus/poll refresh GET can read content older than a concurrent save's
  // POST. Without sequencing, if the stale GET resolves after the save echo it
  // clobbers status.content with pre-save content (AJM-431). These tests pin
  // each overlap ordering: the save's echo must always win.
  it("does not let an in-flight save's stale focus GET clobber the echo", async () => {
    mockResponses({ memoryContent: "old" });

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toMatchObject({ content: "old" });
    });

    const post = deferred<Response>();
    const staleGet = deferred<Response>();

    fetchMock.mockReturnValueOnce(post.promise); // save POST
    fetchMock.mockReturnValueOnce(staleGet.promise); // refresh GET (pre-save read)

    await act(async () => {
      const savePromise = result.current.save("new");
      // refresh() is issued while the save is still in flight.
      const refreshPromise = result.current.refresh();

      // The save echo lands first and sets "new".
      post.resolve(jsonResponse({ memoryContent: "new" }));
      await savePromise;

      // The stale GET resolves last; the guard must drop it.
      staleGet.resolve(jsonResponse({ memoryContent: "old" }));
      await refreshPromise;
    });

    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "new",
    });
  });

  it("defers to a save that starts mid-refresh", async () => {
    mockResponses({ memoryContent: "old" });

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toMatchObject({ content: "old" });
    });

    const staleGet = deferred<Response>();
    const post = deferred<Response>();

    fetchMock.mockReturnValueOnce(staleGet.promise); // refresh GET (issued first)
    fetchMock.mockReturnValueOnce(post.promise); // save POST (starts during window)

    await act(async () => {
      const refreshPromise = result.current.refresh();
      // Save begins after the GET is in flight, so no save is counted at the
      // refresh's start — only the started-during-window guard catches it.
      const savePromise = result.current.save("new");

      post.resolve(jsonResponse({ memoryContent: "new" }));
      await savePromise;

      staleGet.resolve(jsonResponse({ memoryContent: "old" }));
      await refreshPromise;
    });

    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "new",
    });
  });

  it("does not let a superseded refresh error override an in-flight save", async () => {
    mockResponses({ memoryContent: "old" });

    const { result } = renderHook(() => useContextMemory());

    await waitFor(() => {
      expect(result.current.status).toMatchObject({ content: "old" });
    });

    const post = deferred<Response>();
    const failingGet = deferred<Response>();

    fetchMock.mockReturnValueOnce(post.promise); // save POST
    fetchMock.mockReturnValueOnce(failingGet.promise); // refresh GET (will reject)

    await act(async () => {
      const savePromise = result.current.save("new");
      const refreshPromise = result.current.refresh();

      post.resolve(jsonResponse({ memoryContent: "new" }));
      await savePromise;

      failingGet.reject(new Error("network down"));
      await refreshPromise;
    });

    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "new",
    });
  });

  // AJM-436: while the editor is open AND the window is focused, poll so
  // external writes (ppal-context tool, Max textedit) surface without a manual
  // refocus. Fake timers + a stubbed document.hasFocus drive the cases.
  describe("focus-gated polling", () => {
    const POLL_MS = 5000; // mirrors POLL_INTERVAL_MS in the hook

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    // Flush the mount-time load (a microtask chain, not a timer).
    async function flushInitialLoad(): Promise<void> {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }

    it("re-reads memory each interval while focused", async () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      mockResponses({ memoryContent: "old" }, { memoryContent: "external" });

      const { result } = renderHook(() => useContextMemory());

      await flushInitialLoad();
      expect(result.current.status).toMatchObject({ content: "old" });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      expect(result.current.status).toMatchObject({ content: "external" });
    });

    it("does not poll while the window is unfocused", async () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(false);
      mockResponses({ memoryContent: "old" });

      const { result } = renderHook(() => useContextMemory());

      await flushInitialLoad();
      expect(result.current.status).toMatchObject({ content: "old" });

      // The mount load (not focus-gated) already fired; nothing should fetch
      // again while blurred.
      fetchMock.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("stops polling after the editor unmounts", async () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      mockResponses({ memoryContent: "old" });

      const { result, unmount } = renderHook(() => useContextMemory());

      await flushInitialLoad();
      expect(result.current.status).toMatchObject({ content: "old" });

      unmount();
      fetchMock.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/**
 * Externally-resolvable promise, so a test can pin the resolution order of a
 * concurrent save POST and refresh GET independent of issue order.
 * @returns A promise plus its resolve/reject handles
 */
function deferred<T>(): Deferred<T> {
  // The executor runs synchronously, so all three fields are set before return.
  const box: Partial<Deferred<T>> = {};

  box.promise = new Promise<T>((resolve, reject) => {
    box.resolve = resolve;
    box.reject = reject;
  });

  return box as Deferred<T>;
}
