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

  /**
   * Run an install and wait for it to fail.
   * @param result - The rendered hook's result
   * @param message - The expected install error
   */
  async function expectInstallError(
    result: Awaited<ReturnType<typeof renderPastMountRead>>["result"],
    message: string,
  ): Promise<void> {
    await act(() => {
      result.current.install(USER_LIBRARY, false);
    });
    await waitForHookState(() => {
      expect(result.current.installError).toBe(message);
    });
  }

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
    await expectInstallError(result, "EPIPE");
  });

  it("re-reads the status after a failed install, which may have changed it", async () => {
    const { result } = await renderPastMountRead();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Couldn't install the device." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(deviceStatusBody()));

    await expectInstallError(result, "Couldn't install the device.");
    await waitForHookState(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  it("clears an earlier error when the next install works", async () => {
    const { result } = await renderPastMountRead();

    fetchMock.mockRejectedValueOnce(new Error("EPIPE"));
    await expectInstallError(result, "EPIPE");

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

  describe("installWrappers", () => {
    it("posts the User Library to the wrapper route, and reports what it did", async () => {
      const { result } = await renderPastMountRead();

      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          detail: "Plug-in wrapper devices: A installed.",
          pluginHost: [{ name: "A", status: "installed" }],
        }),
      );
      fetchMock.mockResolvedValueOnce(jsonResponse(deviceStatusBody()));
      await act(() => {
        result.current.installWrappers(USER_LIBRARY);
      });
      await waitForHookState(() => {
        expect(result.current.installResult).not.toBeNull();
      });

      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];

      expect(url).toContain("/device-install/plugin-host");
      expect(JSON.parse(init.body as string)).toStrictEqual({
        userLibrary: USER_LIBRARY,
      });
      expect(result.current.installResult).toStrictEqual({
        detail: "Plug-in wrapper devices: A installed.",
        path: null,
        failed: false,
      });
      await waitForHookState(() => {
        expect(fetchMock).toHaveBeenCalledTimes(3);
      });
    });

    it("marks the result failed when a wrapper did", async () => {
      const { result } = await renderPastMountRead();

      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          detail: "A failed.",
          pluginHost: [{ name: "A", ok: false }, { name: "B" }],
        }),
      );
      fetchMock.mockResolvedValueOnce(jsonResponse(deviceStatusBody()));
      await act(() => {
        result.current.installWrappers(USER_LIBRARY);
      });
      await waitForHookState(() => {
        expect(result.current.installResult?.failed).toBe(true);
      });
    });

    it.each([
      ["no detail", { pluginHost: [] }],
      ["no wrapper list", { detail: "Done." }],
      ["a wrapper list that isn't one", { detail: "Done.", pluginHost: "x" }],
    ])("reports an error for a 200 with %s", async (_what, body) => {
      const { result } = await renderPastMountRead();

      fetchMock.mockResolvedValueOnce(jsonResponse(body));
      await act(() => {
        result.current.installWrappers(USER_LIBRARY);
      });
      await waitForHookState(() => {
        expect(result.current.installError).toBe(
          "Install failed: the server didn't say what it did",
        );
      });
      expect(result.current.installResult).toBeNull();
    });

    it("reports the server's reason, and a network failure", async () => {
      const { result } = await renderPastMountRead();

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not a folder: /x" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );
      await act(() => {
        result.current.installWrappers(USER_LIBRARY);
      });
      await waitForHookState(() => {
        expect(result.current.installError).toBe("Not a folder: /x");
      });

      fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));
      await act(() => {
        result.current.installWrappers(USER_LIBRARY);
      });
      await waitForHookState(() => {
        expect(result.current.installError).toBe("Failed to fetch");
      });
    });
  });
});
