// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  deferred,
  installFetchMock,
  jsonResponse,
  type Deferred,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { useNetworkAccess } from "#webui/hooks/settings/installation/use-network-access";

describe("useNetworkAccess re-reading on focus", () => {
  const fetchMock = installFetchMock();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const reads = (): number =>
    fetchMock.mock.calls.filter(([, init]) => init?.method !== "PUT").length;

  /**
   * Answer GETs from a queue of values, and PUTs with what the test gives.
   * @param first - What the mount read reports
   * @returns The queue for later reads, and the gate the PUT waits on
   */
  function serve(first: boolean | Error): {
    later: Array<Deferred<Response>>;
    put: Deferred<Response>;
  } {
    const later: Array<Deferred<Response>> = [];
    const put = deferred<Response>();
    let firstRead = true;

    const answer = (_url: string, init?: RequestInit): Promise<Response> => {
      if (init?.method === "PUT") {
        return put.promise;
      }

      if (firstRead) {
        firstRead = false;

        return first instanceof Error
          ? Promise.reject(first)
          : Promise.resolve(jsonResponse({ allowNetwork: first }));
      }

      const next = deferred<Response>();

      later.push(next);

      return next.promise;
    };

    // The shared mock is untyped, so its implementations would read as void.
    (
      fetchMock as unknown as Mock<
        (url: string, init?: RequestInit) => Promise<Response>
      >
    ).mockImplementation(answer);

    return { later, put };
  }

  /**
   * Render the hook and wait for the mount read.
   * @param first - What the mount read reports
   * @returns The rendered hook, and the gates
   */
  async function mount(first: boolean | Error = false) {
    const gates = serve(first);
    const rendered = renderHook(() => useNetworkAccess());

    await waitForHookState(() => {
      expect(
        rendered.result.current.allowNetwork != null ||
          rendered.result.current.loadFailed,
      ).toBe(true);
    });

    return { ...rendered, ...gates };
  }

  /**
   * Focus the window, answer the read it starts with "on", and wait for the hook
   * to show it.
   * @param mounted - What `mount` returned
   */
  async function refocusAndTurnOn(
    mounted: Awaited<ReturnType<typeof mount>>,
  ): Promise<void> {
    window.dispatchEvent(new Event("focus"));
    mounted.later[0]?.resolve(jsonResponse({ allowNetwork: true }));

    await waitForHookState(() => {
      expect(mounted.result.current.allowNetwork).toBe(true);
    });
  }

  /**
   * Make the page report `state` as its visibility, then say it changed.
   * @param state - "visible" or "hidden"
   */
  function becomes(state: "visible" | "hidden"): void {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("shows the server's new answer when the window regains focus", async () => {
    const mounted = await mount(false);

    await refocusAndTurnOn(mounted);

    expect(mounted.result.current.allowNetwork).toBe(true);
  });

  it("reads again when the page becomes visible, not when it is hidden", async () => {
    const { result, later } = await mount(false);

    becomes("hidden");
    expect(reads()).toBe(1);

    becomes("visible");
    later[0]?.resolve(jsonResponse({ allowNetwork: true }));

    await waitForHookState(() => {
      expect(result.current.allowNetwork).toBe(true);
    });
  });

  it("stops listening once unmounted", async () => {
    const { unmount } = await mount(false);

    unmount();
    window.dispatchEvent(new Event("focus"));
    becomes("visible");

    expect(reads()).toBe(1);
  });

  it("aborts a read still running when it unmounts", async () => {
    const { unmount } = await mount(false);

    window.dispatchEvent(new Event("focus"));
    const signal = fetchMock.mock.calls.at(-1)?.[1]?.signal;

    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("keeps the shown value when the read fails or says nothing usable", async () => {
    const { result, later } = await mount(true);

    window.dispatchEvent(new Event("focus"));
    later[0]?.reject(new Error("Failed to fetch"));
    await act(async () => {
      await Promise.resolve();
    });

    window.dispatchEvent(new Event("focus"));
    later[1]?.resolve(jsonResponse({}));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.allowNetwork).toBe(true);
    expect(result.current.loadFailed).toBe(false);
  });

  it("recovers from a failed first read", async () => {
    const mounted = await mount(new Error("Failed to fetch"));

    expect(mounted.result.current.loadFailed).toBe(true);

    await refocusAndTurnOn(mounted);
    expect(mounted.result.current.loadFailed).toBe(false);
  });

  it("uses the newest read when two overlap", async () => {
    const { result, later } = await mount(false);

    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
    later[1]?.resolve(jsonResponse({ allowNetwork: true }));
    await waitForHookState(() => {
      expect(result.current.allowNetwork).toBe(true);
    });

    // The first read was aborted; even if its answer arrives, it is ignored.
    later[0]?.resolve(jsonResponse({ allowNetwork: false }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.allowNetwork).toBe(true);
  });

  it("does not read while a change is in flight", async () => {
    const { result, put } = await mount(false);

    await act(() => {
      result.current.setAllowNetwork(true);
    });
    window.dispatchEvent(new Event("focus"));

    expect(reads()).toBe(1);

    put.resolve(jsonResponse({ allowNetwork: true }));
    await waitForHookState(() => {
      expect(result.current.busy).toBe(false);
    });
    expect(result.current.allowNetwork).toBe(true);
  });

  it.each([
    ["before the change finishes", true],
    ["after the change finishes", false],
  ])(
    "ignores a read from before a change when it lands %s",
    async (_when, readFirst) => {
      const { result, later, put } = await mount(false);

      window.dispatchEvent(new Event("focus"));
      await act(() => {
        result.current.setAllowNetwork(true);
      });

      const stale = (): void =>
        later[0]?.resolve(jsonResponse({ allowNetwork: false }));
      const answer = (): void =>
        put.resolve(jsonResponse({ allowNetwork: true }));

      if (readFirst) {
        stale();
        answer();
      } else {
        answer();
        await waitForHookState(() => {
          expect(result.current.busy).toBe(false);
        });
        stale();
      }

      await waitForHookState(() => {
        expect(result.current.busy).toBe(false);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.allowNetwork).toBe(true);
    },
  );

  it("reads again after a change has finished", async () => {
    const { result, later, put } = await mount(false);

    await act(() => {
      result.current.setAllowNetwork(true);
    });
    put.resolve(jsonResponse({ allowNetwork: true }));
    await waitForHookState(() => {
      expect(result.current.busy).toBe(false);
    });

    window.dispatchEvent(new Event("focus"));
    later[0]?.resolve(jsonResponse({ allowNetwork: false }));

    await waitForHookState(() => {
      expect(result.current.allowNetwork).toBe(false);
    });
  });
});
