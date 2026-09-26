// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import {
  deferred,
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { useRemoteScript } from "#webui/hooks/settings/use-remote-script";
import {
  statusBody,
  USER_LIBRARY,
} from "#webui/components/settings/tests/helpers/remote-script-status-test-helpers";

describe("useRemoteScript status read", () => {
  const fetchMock = installFetchMock();

  it("stays quiet when the mount read is aborted by an unmount", async () => {
    const pending = deferred<Response>();

    fetchMock.mockReturnValueOnce(pending.promise);

    const { result, unmount } = renderHook(() => useRemoteScript());

    unmount();

    await act(async () => {
      pending.reject(new DOMException("Aborted", "AbortError"));
      await Promise.resolve();
    });

    // Neither the error nor the spinner moved: the tab is gone, and a late
    // answer must not repaint it.
    expect(result.current.loadError).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("shows a non-Error rejection as its string form", async () => {
    fetchMock.mockRejectedValueOnce("socket hung up");

    const { result } = renderHook(() => useRemoteScript());

    await waitForHookState(() => {
      expect(result.current.loadError).toBe("socket hung up");
    });
    expect(result.current.loading).toBe(false);
  });

  it("ignores an older read that lands after a newer one", async () => {
    const mountRead = deferred<Response>();

    fetchMock.mockReturnValueOnce(mountRead.promise);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(statusBody({ running: true })),
    );

    const { result } = renderHook(() => useRemoteScript());

    await act(() => {
      result.current.refresh();
    });
    await waitForHookState(() => {
      expect(result.current.status?.running).toBe(true);
    });

    await act(async () => {
      mountRead.resolve(jsonResponse(statusBody({ running: false })));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchSignal(0)?.aborted).toBe(true);
    expect(result.current.status?.running).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("stays loading when a superseded read rejects", async () => {
    const mountRead = deferred<Response>();

    fetchMock.mockReturnValueOnce(mountRead.promise);
    fetchMock.mockReturnValueOnce(deferred<Response>().promise);

    const { result } = renderHook(() => useRemoteScript());

    await act(() => {
      result.current.refresh();
    });

    await act(async () => {
      mountRead.reject(new DOMException("Aborted", "AbortError"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The refresh read is still out, so the spinner stays.
    expect(result.current.loading).toBe(true);
    expect(result.current.loadError).toBeNull();
  });

  it("keeps the last status when a refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody()));

    const { result } = renderHook(() => useRemoteScript());

    await waitForHookState(() => {
      expect(result.current.status).not.toBeNull();
    });

    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    await act(() => {
      result.current.refresh();
    });
    await waitForHookState(() => {
      expect(result.current.loadError).toBe("Failed to fetch");
    });
    expect(result.current.status?.userLibrary).toBe(USER_LIBRARY);
  });

  /**
   * @param call - Which fetch call
   * @returns The abort signal that call was given
   */
  function fetchSignal(call: number): AbortSignal | undefined {
    const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;

    return init?.signal ?? undefined;
  }
});

describe("useRemoteScript install failures", () => {
  const fetchMock = installFetchMock();

  /**
   * Render the hook past its mount read, then run an install whose POST
   * rejects.
   * @param reason - What the install POST rejects with
   * @returns The install error the hook surfaced
   */
  async function installRejectedWith(reason: unknown): Promise<string | null> {
    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody()));

    const { result } = renderHook(() => useRemoteScript());

    await waitForHookState(() => {
      expect(result.current.status).not.toBeNull();
    });

    fetchMock.mockRejectedValueOnce(reason);

    await act(() => {
      result.current.install(USER_LIBRARY);
    });

    await waitForHookState(() => {
      expect(result.current.installError).not.toBeNull();
    });

    return result.current.installError;
  }

  it("surfaces a thrown Error's message", async () => {
    expect(await installRejectedWith(new Error("Failed to fetch"))).toBe(
      "Failed to fetch",
    );
  });

  it("surfaces a non-Error rejection as its string form", async () => {
    expect(await installRejectedWith("EPIPE")).toBe("EPIPE");
  });

  it("skips the status re-read when the install lands after unmount", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody()));

    const { result, unmount } = renderHook(() => useRemoteScript());

    await waitForHookState(() => {
      expect(result.current.status).not.toBeNull();
    });

    const post = deferred<Response>();

    fetchMock.mockReturnValueOnce(post.promise);

    await act(() => {
      result.current.install(USER_LIBRARY);
    });
    unmount();

    await act(async () => {
      post.resolve(jsonResponse({ path: USER_LIBRARY }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Mount read and install POST only: no GET nobody would abort.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
