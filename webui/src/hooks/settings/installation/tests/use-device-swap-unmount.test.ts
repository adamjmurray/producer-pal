// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_LIBRARY } from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";
import {
  deferred,
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import {
  POLL_MS,
  useDeviceSwap,
} from "#webui/hooks/settings/installation/use-device-swap";

describe("useDeviceSwap when the tab closes mid-swap", () => {
  const fetchMock = installFetchMock();

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not start watching for the new device once the POST is answered", async () => {
    const post = deferred<Response>();
    const onSwapped = vi.fn();

    fetchMock.mockReturnValueOnce(post.promise);

    const { result, unmount } = renderHook(() => useDeviceSwap(onSwapped));

    // Let the mount effects run, so closing the tab really marks it closed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      result.current.swap(USER_LIBRARY);
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();

    // The swap succeeds only now, after nobody is left to watch it.
    fetchMock.mockResolvedValue(jsonResponse({}));
    await act(async () => {
      post.resolve(jsonResponse({ swapping: true }));
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onSwapped).not.toHaveBeenCalled();
  });
});
