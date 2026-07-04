// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared test suite for the thin useDocMemory transport wrappers
// (useGlobalContextMemory, useSystemPromptMemory). Each wraps the same
// useDocMemory core over a GET(no-store)/PUT(JSON) endpoint, differing only by
// URL and error copy — so their behavioral tests are one parametrized suite
// rather than per-hook clones. Callers keep the `@vitest-environment happy-dom`
// directive in their own file (it must be file-level).

import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type UseDocMemoryReturn } from "#webui/hooks/context/use-doc-memory";

/** Per-hook inputs for the shared transport suite. */
export interface DocMemoryTransportSpec {
  /** Hook display name for the describe block. */
  hookName: string;
  /** The hook under test. */
  useHook: () => UseDocMemoryReturn;
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
 * Register the standard read/write behavioral tests for a useDocMemory
 * transport wrapper.
 * @param spec - Per-hook URL and error-copy inputs
 */
export function describeDocMemoryTransport(spec: DocMemoryTransportSpec): void {
  describe(spec.hookName, () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

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

      const { result } = renderHook(spec.useHook);

      await waitFor(() => {
        expect(result.current.status.kind).toBe("error");
      });

      expect(
        result.current.status.kind === "error" && result.current.status.message,
      ).toContain(spec.readError);
    });

    it("save() PUTs the content and echoes the stored value", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: "" }));

      const { result } = renderHook(spec.useHook);

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
        spec.url,
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ content: "saved\n" }),
        }),
      );
    });

    it("save() surfaces an error when the PUT is not ok", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: "" }));

      const { result } = renderHook(spec.useHook);

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
      expect(result.current.saveError).toContain(spec.writeError);
    });

    it("save() echoes empty string when the PUT omits content", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ content: "x" }));

      const { result } = renderHook(spec.useHook);

      await waitFor(() => {
        expect(result.current.status.kind).toBe("ready");
      });

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
