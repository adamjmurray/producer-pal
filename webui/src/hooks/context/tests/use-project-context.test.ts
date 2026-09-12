// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { describe, expect, it, vi } from "vitest";
import { useProjectContext } from "#webui/hooks/context/use-project-context";
import {
  deferred,
  type Deferred,
  installFetchMock,
  jsonResponse,
  useFakeTimersForPolling,
} from "./doc-transport-test-helpers";

// happy-dom defaults to http://localhost:3000/, so the same-origin /config
// endpoint resolves to localhost:3000.
const CONFIG_URL = "http://localhost:3000/config";

describe("useProjectContext", () => {
  const fetchMock = installFetchMock();

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

  // Renders the hook with `{ projectContext: "old" }` as the initial GET (plus any
  // extra queued responses) and waits for that content to load.
  async function renderWithLoadedContent(
    ...extraResponses: Array<object | Response>
  ): Promise<{ current: ReturnType<typeof useProjectContext> }> {
    mockResponses({ projectContext: "old" }, ...extraResponses);

    const { result } = renderHook(() => useProjectContext());

    await waitForHookState(() => {
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "old",
      });
    });

    return result;
  }

  // Settles a raced refresh GET with pre-save content — the stale read that must
  // lose to the save's echo.
  const resolveStale = (get: Deferred<Response>): void => {
    get.resolve(jsonResponse({ projectContext: "old" }));
  };

  // Asserts the save's content won the race (the shared expectation of every
  // save-vs-refresh ordering).
  function expectSavedContentWon(result: {
    current: ReturnType<typeof useProjectContext>;
  }): void {
    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "new",
    });
  }

  // Overlaps one save with one refresh, both in flight at once. The save's echo
  // ("new") always lands first and the refresh's GET settles last, so the guard
  // under test is the only thing that can keep the stale GET from winning.
  // `saveFirst` picks which request is issued first (fetchMock is queued to
  // match); `settleGet` settles the refresh GET (stale content, or a rejection).
  async function raceSaveAgainstRefresh(
    result: { current: ReturnType<typeof useProjectContext> },
    {
      saveFirst,
      settleGet,
    }: { saveFirst: boolean; settleGet: (get: Deferred<Response>) => void },
  ): Promise<void> {
    const post = deferred<Response>();
    const get = deferred<Response>();

    fetchMock.mockReturnValueOnce(saveFirst ? post.promise : get.promise);
    fetchMock.mockReturnValueOnce(saveFirst ? get.promise : post.promise);

    await act(async () => {
      let savePromise: Promise<unknown>;
      let refreshPromise: Promise<unknown>;

      if (saveFirst) {
        savePromise = result.current.save("new");
        refreshPromise = result.current.refresh();
      } else {
        refreshPromise = result.current.refresh();
        savePromise = result.current.save("new");
      }

      post.resolve(jsonResponse({ projectContext: "new" }));
      await savePromise;

      settleGet(get);
      await refreshPromise;
    });
  }

  it("loads project-context content on mount", async () => {
    mockResponses({ projectContext: "# hi" });

    const { result } = renderHook(() => useProjectContext());

    await waitForHookState(() => {
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

    const { result } = renderHook(() => useProjectContext());

    await waitForHookState(() => {
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

    const { result } = renderHook(() => useProjectContext());

    await waitForHookState(() => {
      expect(result.current.status.kind).toBe("error");
    });
  });

  it("save() posts content and updates status", async () => {
    const result = await renderWithLoadedContent({ projectContext: "new" });

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
        body: JSON.stringify({ projectContext: "new" }),
      }),
    );
  });

  it("save() surfaces error from server", async () => {
    mockResponses(
      { projectContext: "" },
      new Response("forbidden", { status: 403, statusText: "Forbidden" }),
    );

    const { result } = renderHook(() => useProjectContext());

    await waitForHookState(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    const saved = await callAndCapture(() => result.current.save("attempt"));

    expect(saved).toBe(false);
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.saveError).toContain("Config update failed");
  });

  it("clear() saves empty content", async () => {
    const result = await renderWithLoadedContent({ projectContext: "" });

    await act(async () => {
      await result.current.clear();
    });

    expect(result.current.status).toStrictEqual({ kind: "ready", content: "" });
    expect(fetchMock).toHaveBeenLastCalledWith(
      CONFIG_URL,
      expect.objectContaining({
        body: JSON.stringify({ projectContext: "" }),
      }),
    );
  });

  it("reads a save echo that omits projectContext as empty", async () => {
    const result = await renderWithLoadedContent({});

    await act(async () => {
      await result.current.save("new");
    });

    expect(result.current.status).toStrictEqual({ kind: "ready", content: "" });
  });

  it("re-fetches on window focus so external writes surface", async () => {
    const result = await renderWithLoadedContent({ projectContext: "new" });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      // Yield so the focus-triggered fetch can resolve.
      await Promise.resolve();
    });

    await waitForHookState(() => {
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "new",
      });
    });
  });

  it("refresh() re-reads the project context", async () => {
    mockResponses({ projectContext: "v1" }, { projectContext: "v2" });

    const { result } = renderHook(() => useProjectContext());

    await waitForHookState(() => {
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "v1",
      });
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "v2",
    });
  });

  it("keeps loaded content when a later refresh fails", async () => {
    // Regression: refresh is also the focus poll, and its error path replaced
    // the whole screen — unmounting the editor under it and taking unsaved
    // edits with it. A failed tick now leaves the loaded content alone.
    const result = await renderWithLoadedContent(
      new Response("server boom", {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "old",
    });
  });

  it("falls back to empty string when projectContext is missing", async () => {
    mockResponses({});

    const { result } = renderHook(() => useProjectContext());

    await waitForHookState(() => {
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "",
      });
    });
  });

  it("stringifies non-Error rejections", async () => {
    fetchMock.mockRejectedValueOnce("plain string error");

    const { result } = renderHook(() => useProjectContext());

    await waitForHookState(() => {
      expect(result.current.status).toStrictEqual({
        kind: "error",
        message: "plain string error",
      });
    });
  });

  // A focus/poll refresh GET can read content older than a concurrent save's
  // POST. Without sequencing, if the stale GET resolves after the save echo it
  // clobbers status.content with pre-save content. These tests pin
  // each overlap ordering: the save's echo must always win.
  it("does not let an in-flight save's stale focus GET clobber the echo", async () => {
    const result = await renderWithLoadedContent();

    // refresh() is issued while the save is still in flight, so its pre-save
    // read resolves last and the in-flight-save guard must drop it.
    await raceSaveAgainstRefresh(result, {
      saveFirst: true,
      settleGet: resolveStale,
    });

    expectSavedContentWon(result);
  });

  it("defers to a save that starts mid-refresh", async () => {
    const result = await renderWithLoadedContent();

    // The save begins after the GET is in flight, so no save is counted at the
    // refresh's start — only the started-during-window guard catches it.
    await raceSaveAgainstRefresh(result, {
      saveFirst: false,
      settleGet: resolveStale,
    });

    expectSavedContentWon(result);
  });

  it("does not let a superseded refresh error override an in-flight save", async () => {
    const result = await renderWithLoadedContent();

    // The superseded refresh REJECTS rather than resolving stale: its error must
    // not overwrite the saved content with an error status.
    await raceSaveAgainstRefresh(result, {
      saveFirst: true,
      settleGet: (get) => get.reject(new Error("network down")),
    });

    expectSavedContentWon(result);
  });

  it("discards a refresh GET that resolves after the editor unmounts", async () => {
    mockResponses({ projectContext: "old" });

    const { result, unmount } = renderHook(() => useProjectContext());

    await waitForHookState(() => {
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "old",
      });
    });

    const lateGet = deferred<Response>();

    fetchMock.mockReturnValueOnce(lateGet.promise); // refresh GET (still pending)

    await act(async () => {
      const refreshPromise = result.current.refresh();

      // Tear the hook down while the GET is in flight, then let it land: the
      // guard must drop it rather than setState on the torn-down hook.
      unmount();
      lateGet.resolve(jsonResponse({ projectContext: "external" }));
      await refreshPromise;
    });

    // The last-rendered status stays "old"; the post-unmount GET was discarded.
    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "old",
    });
  });

  // While the editor is open AND the window is focused, poll so
  // external writes (ppal-context tool, Max textedit) surface without a manual
  // refocus. Fake timers + a stubbed document.hasFocus drive the cases.
  describe("focus-gated polling", () => {
    const POLL_MS = useFakeTimersForPolling();

    // Flush the mount-time load (a microtask chain, not a timer).
    async function flushInitialLoad(): Promise<void> {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }

    it("re-reads the project context each interval while focused", async () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      mockResponses({ projectContext: "old" }, { projectContext: "external" });

      const { result } = renderHook(() => useProjectContext());

      await flushInitialLoad();
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "old",
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "external",
      });
    });

    it("does not poll while the window is unfocused", async () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(false);
      mockResponses({ projectContext: "old" });

      const { result } = renderHook(() => useProjectContext());

      await flushInitialLoad();
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "old",
      });

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
      mockResponses({ projectContext: "old" });

      const { result, unmount } = renderHook(() => useProjectContext());

      await flushInitialLoad();
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "old",
      });

      unmount();
      fetchMock.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
