// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared test suite for the thin useDoc transport wrappers
// (useGlobalContextMemory, useSystemPromptMemory). Each wraps the same
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
    const renderReady = (
      content = "",
    ): Promise<{ current: UseDocReturn }> => {
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
