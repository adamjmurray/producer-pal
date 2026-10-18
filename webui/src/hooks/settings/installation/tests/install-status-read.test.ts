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
import { useRemoteScript } from "#webui/hooks/settings/installation/use-remote-script";
import { deviceStatusBody } from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";
import { statusBody } from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";

/** The status-read half both installation hooks share. */
interface StatusReader {
  status: unknown;
  loading: boolean;
  loadError: string | null;
  refresh: () => void;
}

// Both hooks read their status the same way: each read aborts the one before.
describe.each([
  {
    name: "useDeviceInstall",
    useHook: (): StatusReader => useDeviceInstall(),
    older: deviceStatusBody(),
    newer: deviceStatusBody({ state: "same" }),
  },
  {
    name: "useRemoteScript",
    useHook: (): StatusReader => useRemoteScript(),
    older: statusBody({ running: false }),
    newer: statusBody({ running: true }),
  },
])("$name status read", ({ useHook, older, newer }) => {
  const fetchMock = installFetchMock();

  /**
   * @param call - Which fetch call
   * @returns The abort signal that call was given
   */
  function fetchSignal(call: number): AbortSignal | undefined {
    const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;

    return init?.signal ?? undefined;
  }

  it("stays quiet when the mount read is aborted by an unmount", async () => {
    const pending = deferred<Response>();

    fetchMock.mockReturnValueOnce(pending.promise);

    const { result, unmount } = renderHook(useHook);

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

    const { result } = renderHook(useHook);

    await waitForHookState(() => {
      expect(result.current.loadError).toBe("socket hung up");
    });
    expect(result.current.loading).toBe(false);
  });

  it("ignores an older read that lands after a newer one", async () => {
    const mountRead = deferred<Response>();

    fetchMock.mockReturnValueOnce(mountRead.promise);
    fetchMock.mockResolvedValueOnce(jsonResponse(newer));

    const { result } = renderHook(useHook);

    await act(() => {
      result.current.refresh();
    });
    await waitForHookState(() => {
      expect(result.current.status).toStrictEqual(newer);
    });

    await act(async () => {
      mountRead.resolve(jsonResponse(older));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchSignal(0)?.aborted).toBe(true);
    expect(result.current.status).toStrictEqual(newer);
    expect(result.current.loading).toBe(false);
  });

  it("stays loading when a superseded read rejects", async () => {
    const mountRead = deferred<Response>();

    fetchMock.mockReturnValueOnce(mountRead.promise);
    fetchMock.mockReturnValueOnce(deferred<Response>().promise);

    const { result } = renderHook(useHook);

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
});
