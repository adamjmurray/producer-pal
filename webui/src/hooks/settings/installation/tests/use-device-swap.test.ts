// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { deviceStatusBody } from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";
import { USER_LIBRARY } from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";
import {
  SWAP_TIMED_OUT,
  SWAP_TIMEOUT_MS,
  useDeviceSwap,
} from "#webui/hooks/settings/installation/use-device-swap";

const OLD_DEVICE = deviceStatusBody();
const NEW_DEVICE = deviceStatusBody({ inUserLibrary: true, state: "same" });

describe("useDeviceSwap", () => {
  const fetchMock = installFetchMock();
  // The shared mock is untyped, so its implementations would read as void.
  const fetchImpl = fetchMock as unknown as Mock<
    (url: string, init: RequestInit) => Promise<Response>
  >;
  const onSwapped = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onSwapped.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Start a swap and let its POST settle.
   *
   * @param post - What the POST does: a response, or a thrown error
   * @returns The rendered hook
   */
  async function startSwap(post: Response | Error) {
    if (post instanceof Error) {
      fetchMock.mockRejectedValueOnce(post);
    } else {
      fetchMock.mockResolvedValueOnce(post);
    }

    const rendered = renderHook(() => useDeviceSwap(onSwapped));

    await act(async () => {
      rendered.result.current.swap(USER_LIBRARY);
      await vi.advanceTimersByTimeAsync(0);
    });

    return rendered;
  }

  /**
   * @param ms - How long to let the poll run
   */
  async function pass(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("sends the User Library, then waits for a device running from it", async () => {
    const { result } = await startSwap(jsonResponse({ swapping: true }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/device-install/swap"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userLibrary: USER_LIBRARY }),
      }),
    );
    expect(result.current.phase).toBe("waiting");

    // The old device still answers, then nothing does, then the new one.
    fetchMock.mockResolvedValueOnce(jsonResponse(OLD_DEVICE));
    await pass(1000);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await pass(1000);
    expect(result.current.phase).toBe("waiting");
    expect(onSwapped).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(jsonResponse(NEW_DEVICE));
    await pass(1000);

    expect(result.current.phase).toBe("done");
    expect(result.current.error).toBeNull();
    expect(onSwapped).toHaveBeenCalledOnce();
  });

  it("takes a dropped connection as the old device dying with the swap", async () => {
    const { result } = await startSwap(new TypeError("Failed to fetch"));

    expect(result.current.phase).toBe("waiting");

    fetchMock.mockResolvedValueOnce(jsonResponse(NEW_DEVICE));
    await pass(1000);

    expect(result.current.phase).toBe("done");
  });

  it.each([
    {
      what: "the server's reason",
      response: () =>
        new Response(JSON.stringify({ error: "No copy." }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      expected: "No copy.",
    },
    {
      what: "the status for a body that isn't JSON",
      response: () => new Response("<html>", { status: 404 }),
      expected: "Swap failed (404)",
    },
    {
      what: "the status for a JSON body with no error",
      response: () => new Response("{}", { status: 502 }),
      expected: "Swap failed (502)",
    },
  ])(
    "fails with $what when the swap is refused",
    async ({ response, expected }) => {
      const { result } = await startSwap(response());

      expect(result.current.phase).toBe("failed");
      expect(result.current.error).toBe(expected);
      expect(onSwapped).not.toHaveBeenCalled();
    },
  );

  it("says so when no new device answers in time", async () => {
    fetchImpl.mockImplementation(() =>
      Promise.resolve(jsonResponse(OLD_DEVICE)),
    );

    const { result } = await startSwap(jsonResponse({ swapping: true }));

    await pass(SWAP_TIMEOUT_MS + 1000);

    expect(result.current.phase).toBe("failed");
    expect(result.current.error).toBe(SWAP_TIMED_OUT);
    expect(onSwapped).not.toHaveBeenCalled();
  });

  it("gives up on a poll the old server takes and never answers", async () => {
    const { result } = await startSwap(jsonResponse({ swapping: true }));

    // Only the abort signal ends a request that is never answered.
    fetchImpl.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    fetchMock.mockResolvedValue(jsonResponse(NEW_DEVICE));

    await pass(1000 + 3000 + 1000 + 1000);

    expect(result.current.phase).toBe("done");
  });

  it("stops watching when the tab closes", async () => {
    const { result, unmount } = await startSwap(
      jsonResponse({ swapping: true }),
    );

    unmount();
    fetchMock.mockResolvedValue(jsonResponse(NEW_DEVICE));
    await pass(5000);

    expect(result.current.phase).toBe("waiting");
    expect(onSwapped).not.toHaveBeenCalled();
  });

  it("stops quietly when the tab closes before the POST is answered", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "No." }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result, unmount } = renderHook(() => useDeviceSwap(onSwapped));

    await act(async () => {
      result.current.swap(USER_LIBRARY);
      unmount();
      await vi.advanceTimersByTimeAsync(0);
    });

    // Only the POST went out; the answer to it was left alone.
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onSwapped).not.toHaveBeenCalled();
  });
});
