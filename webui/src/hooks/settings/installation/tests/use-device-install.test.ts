// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
import { useDeviceInstall } from "#webui/hooks/settings/installation/use-device-install";
import {
  DEVICE_PATH,
  deviceStatusBody,
} from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";
import { USER_LIBRARY } from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";

describe("useDeviceInstall", () => {
  const fetchMock = installFetchMock();

  /**
   * Render the hook and wait for its mount read to land.
   * @returns The rendered hook
   */
  async function renderPastMountRead() {
    fetchMock.mockResolvedValueOnce(jsonResponse(deviceStatusBody()));

    const rendered = renderHook(() => useDeviceInstall());

    await waitForHookState(() => {
      expect(rendered.result.current.status).not.toBeNull();
    });

    return rendered;
  }

  it("stays quiet when the mount read is aborted by an unmount", async () => {
    const pending = deferred<Response>();

    fetchMock.mockReturnValueOnce(pending.promise);

    const { result, unmount } = renderHook(() => useDeviceInstall());

    unmount();

    await act(async () => {
      pending.reject(new DOMException("Aborted", "AbortError"));
      await Promise.resolve();
    });

    expect(result.current.loadError).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("shows a non-Error rejection as its string form", async () => {
    fetchMock.mockRejectedValueOnce("socket hung up");

    const { result } = renderHook(() => useDeviceInstall());

    await waitForHookState(() => {
      expect(result.current.loadError).toBe("socket hung up");
    });
    expect(result.current.loading).toBe(false);
  });

  it("ignores an older read that lands after a newer one", async () => {
    const mountRead = deferred<Response>();

    fetchMock.mockReturnValueOnce(mountRead.promise);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(deviceStatusBody({ state: "same" })),
    );

    const { result } = renderHook(() => useDeviceInstall());

    await act(() => {
      result.current.refresh();
    });
    await waitForHookState(() => {
      expect(result.current.status?.state).toBe("same");
    });

    await act(async () => {
      mountRead.resolve(jsonResponse(deviceStatusBody()));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.status?.state).toBe("same");
  });

  it("keeps the last status, and drops the install message, when a refresh fails", async () => {
    const { result } = await renderPastMountRead();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "Installed the device.", path: DEVICE_PATH }),
    );
    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    await act(() => {
      result.current.install(USER_LIBRARY, false);
    });
    await waitForHookState(() => {
      expect(result.current.loadError).toBe("Failed to fetch");
    });

    expect(result.current.status?.userLibrary).toBe(USER_LIBRARY);
    expect(result.current.installResult).toBeNull();
  });

  it("shows a non-Error rejection of the install as its string form", async () => {
    const { result } = await renderPastMountRead();

    fetchMock.mockRejectedValueOnce("EPIPE");
    await act(() => {
      result.current.install(USER_LIBRARY, false);
    });
    await waitForHookState(() => {
      expect(result.current.installError).toBe("EPIPE");
    });
  });

  it("clears an earlier error when the next install works", async () => {
    const { result } = await renderPastMountRead();

    fetchMock.mockRejectedValueOnce(new Error("EPIPE"));
    await act(() => {
      result.current.install(USER_LIBRARY, false);
    });
    await waitForHookState(() => {
      expect(result.current.installError).toBe("EPIPE");
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "Installed the device.", path: DEVICE_PATH }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(deviceStatusBody()));
    await act(() => {
      result.current.install(USER_LIBRARY, false);
    });
    await waitForHookState(() => {
      expect(result.current.installResult?.path).toBe(DEVICE_PATH);
    });

    expect(result.current.installError).toBeNull();
  });

  it("skips the status re-read when the install lands after unmount", async () => {
    const { result, unmount } = await renderPastMountRead();
    const post = deferred<Response>();

    fetchMock.mockReturnValueOnce(post.promise);

    await act(() => {
      result.current.install(USER_LIBRARY, false);
    });
    unmount();

    await act(async () => {
      post.resolve(jsonResponse({ detail: "Done.", path: DEVICE_PATH }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
