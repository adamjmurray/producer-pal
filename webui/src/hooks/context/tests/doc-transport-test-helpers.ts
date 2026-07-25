// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared test suite for the thin useDoc transport wrappers
// (useGlobalContext, useSystemPrompt). Each wraps the same
// useDoc core over a GET(no-store)/PUT(JSON) endpoint, differing only by
// URL and error copy — so their behavioral tests are one parametrized suite
// rather than per-hook clones. Callers keep the `@vitest-environment happy-dom`
// directive in their own file (it must be file-level).

import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type UseDocReturn } from "#webui/hooks/context/use-doc";

/** Per-hook inputs for the shared transport suite. */
export interface DocTransportSpec {
  /** Hook display name for the describe block. */
  hookName: string;
  /** The hook under test. */
  useHook: () => UseDocReturn;
  /** The endpoint URL the hook is expected to hit (happy-dom origin). */
  url: string;
  /** Substring expected in the GET-failure error message. */
  readError: string;
  /** Substring expected in the PUT-failure error message. */
  writeError: string;
}

/**
 * A 200 JSON Response.
 * @param body - Response body serialized as JSON
 * @returns A Response instance
 */
export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Stub the global `fetch` with a mock: reset and re-stubbed before each test,
 * unstubbed after. Returns a stable mock reference (reset, not reassigned) so
 * callers capture it once at describe/module scope and keep using it directly.
 * Register at the same scope the fetch stub should live in (module or describe).
 * @returns The stable fetch mock
 */
export function installFetchMock(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  return fetchMock;
}

/**
 * Render a hook and wait until its `status.kind` reaches the expected value.
 * Shared across the context hooks, whose loads all expose a `status.kind`
 * state; queue the mount responses on the fetch mock before calling.
 * @param useHook - The hook to render
 * @param kind - The status kind to wait for (e.g. "ready", "error")
 * @returns The rendered hook result handle
 */
export async function renderAndWait<T extends { status: { kind: string } }>(
  useHook: () => T,
  kind: string,
): Promise<{ current: T }> {
  const { result } = renderHook(useHook);

  await waitFor(() => {
    expect(result.current.status.kind).toBe(kind);
  });

  return result;
}

/** An externally-resolvable promise plus its resolve/reject handles. */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/**
 * Externally-resolvable promise, so a test can pin the resolution order of a
 * concurrent save and refresh independent of issue order.
 * @returns A promise plus its resolve/reject handles
 */
export function deferred<T>(): Deferred<T> {
  // The executor runs synchronously, so all three fields are set before return.
  const box: Partial<Deferred<T>> = {};

  box.promise = new Promise<T>((resolve, reject) => {
    box.resolve = resolve;
    box.reject = reject;
  });

  return box as Deferred<T>;
}

/**
 * Register the standard read/write behavioral tests for a useDoc
 * transport wrapper.
 * @param spec - Per-hook URL and error-copy inputs
 */
export function describeDocTransport(spec: DocTransportSpec): void {
  describe(spec.hookName, () => {
    const fetchMock = installFetchMock();

    // Load the wrapper past its mount GET so a save test can exercise the write.
    const renderReady = (content = ""): Promise<{ current: UseDocReturn }> => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ content }));

      return renderAndWait(spec.useHook, "ready");
    };

    it("loads content on mount via a no-store GET", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: "# doc" }));

      const { result } = renderHook(spec.useHook);

      await waitFor(() => {
        expect(result.current.status).toStrictEqual({
          kind: "ready",
          content: "# doc",
        });
      });

      expect(fetchMock).toHaveBeenCalledWith(
        spec.url,
        expect.objectContaining({ cache: "no-store" }),
      );
    });

    it("falls back to empty string when content is missing", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));

      const { result } = renderHook(spec.useHook);

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

      const result = await renderAndWait(spec.useHook, "error");

      expect(
        result.current.status.kind === "error" && result.current.status.message,
      ).toContain(spec.readError);
    });

    it("save() PUTs the content and echoes the stored value", async () => {
      const result = await renderReady();

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
        spec.url,
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ content: "saved\n" }),
        }),
      );
    });

    it("save() surfaces an error when the PUT is not ok", async () => {
      const result = await renderReady();

      fetchMock.mockResolvedValueOnce(
        new Response("nope", { status: 403, statusText: "Forbidden" }),
      );

      let ok: boolean | undefined;

      await act(async () => {
        ok = await result.current.save("attempt");
      });

      expect(ok).toBe(false);
      expect(result.current.saveStatus).toBe("error");
      expect(result.current.saveError).toContain(spec.writeError);
    });

    registerSaveOrderingTests(fetchMock, renderReady);

    it("save() echoes empty string when the PUT omits content", async () => {
      const result = await renderReady("x");

      fetchMock.mockResolvedValueOnce(jsonResponse({}));

      await act(async () => {
        await result.current.save("");
      });

      expect(result.current.status).toStrictEqual({
        kind: "ready",
        content: "",
      });
    });
  });
}

/**
 * Register the save-vs-save ordering tests inside the caller's describe block.
 * Two saves of the same doc can overlap (a debounced flush, then a blur or a
 * further keystroke before the first echo lands), and whichever echo arrives
 * LAST would otherwise win — reverting the editor to content the user has
 * already typed past. Split out of {@link describeDocTransport} to keep that
 * function within the per-function line limit.
 * @param fetchMock - The suite's fetch mock, queued in issue order
 * @param renderReady - Renders the hook past its mount GET
 */
function registerSaveOrderingTests(
  fetchMock: ReturnType<typeof vi.fn>,
  renderReady: (content?: string) => Promise<{ current: UseDocReturn }>,
): void {
  // Both ordering tests race the same two saves; only the first write's echo
  // (a stored document, or a failure) differs.
  const raceSaves = async (
    result: { current: UseDocReturn },
    firstEcho: Response,
  ): Promise<boolean | undefined> => {
    const [firstOk] = await raceTwoWrites(
      fetchMock,
      { dispatch: () => result.current.save("one"), echo: firstEcho },
      {
        dispatch: () => result.current.save("two"),
        echo: jsonResponse({ content: "two" }),
      },
    );

    return firstOk as boolean | undefined;
  };

  it("keeps the newest save's content when an older save's echo lands last", async () => {
    const result = await renderReady();

    await raceSaves(result, jsonResponse({ content: "one" }));

    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "two",
    });
    expect(result.current.saveStatus).toBe("saved");
  });

  it("does not let a superseded save's failure paint an error over the newest save", async () => {
    const result = await renderReady();

    const firstOk = await raceSaves(
      result,
      new Response("nope", { status: 500, statusText: "Server Error" }),
    );

    // The caller still learns its own write failed (so it can retry) — only the
    // shared UI state belongs to the newest save.
    expect(firstOk).toBe(false);
    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.saveError).toBeNull();
  });
}

/** One write in a {@link raceTwoWrites} pair: how to dispatch it, and its echo. */
/**
 * The fake-timer lifecycle every focus-gated polling block needs, plus the poll
 * interval the doc hooks use. Registers its own beforeEach/afterEach on the
 * calling suite.
 * @returns The poll interval in ms (mirrors POLL_INTERVAL_MS in use-doc)
 */
export function useFakeTimersForPolling(): number {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  return 5000;
}

export interface RacedWrite {
  /** Dispatch the write (the hook call under test). */
  dispatch: () => Promise<unknown>;
  /** The response its request eventually resolves with. */
  echo: Response;
}

/**
 * Run two writes concurrently and settle the SECOND one FIRST, so the first
 * write's echo lands last — the out-of-order landing every write-ordering guard
 * in these hooks exists for. Shared by the document, entry-collection, and
 * slot-collection suites, which differ only in which hook call they dispatch.
 * @param fetchMock - The suite's fetch mock, queued in dispatch order
 * @param first - The write dispatched first, whose echo resolves last
 * @param second - The write dispatched second, whose echo resolves first
 * @returns Both writes' resolved values, in dispatch order
 */
export async function raceTwoWrites(
  fetchMock: ReturnType<typeof vi.fn>,
  first: RacedWrite,
  second: RacedWrite,
): Promise<[unknown, unknown]> {
  const firstRequest = deferred<Response>();
  const secondRequest = deferred<Response>();

  fetchMock.mockReturnValueOnce(firstRequest.promise);
  fetchMock.mockReturnValueOnce(secondRequest.promise);

  let firstResult: unknown;
  let secondResult: unknown;

  await act(async () => {
    const firstPending = first.dispatch();
    const secondPending = second.dispatch();

    secondRequest.resolve(second.echo);
    secondResult = await secondPending;

    firstRequest.resolve(first.echo);
    firstResult = await firstPending;
  });

  return [firstResult, secondResult];
}
