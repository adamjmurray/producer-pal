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

const USER_LIBRARY = "/Users/me/Music/Ableton/User Library";

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
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        userLibrary: USER_LIBRARY,
        installed: false,
        installedVersion: null,
        bundledVersion: "1.2.0",
        running: false,
        runningVersion: null,
        liveVersion: "12.1",
        updateAvailable: false,
      }),
    );

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
});
