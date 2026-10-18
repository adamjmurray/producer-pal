// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import {
  act,
  renderHook,
  type RenderHookResult,
} from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import {
  deferred,
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { useRemoteScript } from "#webui/hooks/settings/installation/use-remote-script";
import {
  statusBody,
  USER_LIBRARY,
} from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";

/**
 * Render the hook and wait for its mount read to land.
 * @param fetchMock - The installed fetch mock, for the mount read's response
 * @returns The rendered hook
 */
async function renderPastMountRead(
  fetchMock: ReturnType<typeof installFetchMock>,
): Promise<RenderHookResult<ReturnType<typeof useRemoteScript>, unknown>> {
  fetchMock.mockResolvedValueOnce(jsonResponse(statusBody()));

  const rendered = renderHook(() => useRemoteScript());

  await waitForHookState(() => {
    expect(rendered.result.current.status).not.toBeNull();
  });

  return rendered;
}

describe("useRemoteScript status read", () => {
  const fetchMock = installFetchMock();

  it("keeps the last status when a refresh fails", async () => {
    const { result } = await renderPastMountRead(fetchMock);

    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    await act(() => {
      result.current.refresh();
    });
    await waitForHookState(() => {
      expect(result.current.loadError).toBe("Failed to fetch");
    });
    expect(result.current.status?.userLibrary).toBe(USER_LIBRARY);
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
    const { result } = await renderPastMountRead(fetchMock);

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
    const { result, unmount } = await renderPastMountRead(fetchMock);

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
