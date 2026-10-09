// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { statusBody } from "#webui/components/settings/tests/helpers/remote-script-status-test-helpers";
import { useRemoteScriptNotice } from "#webui/hooks/connection/use-remote-script-notice";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import {
  deferred,
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { useRemoteScript } from "#webui/hooks/settings/use-remote-script";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";

const OLD_INSTALL = {
  installed: true,
  installedVersion: "1.1.0",
  updateAvailable: true,
  running: true,
  runningVersion: "1.1.0",
};

describe("useRemoteScriptNotice", () => {
  const fetchMock = installFetchMock();

  it("is null until the status lands", () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useRemoteScriptNotice("connecting"));

    expect(result.current).toBeNull();
  });

  it("asks for an update when the installed script is older than this build", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody(OLD_INSTALL)));

    const { result } = renderHook(() => useRemoteScriptNotice("connecting"));

    await waitForHookState(() => expect(result.current).toBe("update"));
  });

  it("asks for a restart when Live runs an older copy than the installed one", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        statusBody({
          installed: true,
          installedVersion: "1.2.0",
          running: true,
          runningVersion: "1.1.0",
        }),
      ),
    );

    const { result } = renderHook(() => useRemoteScriptNotice("connecting"));

    await waitForHookState(() => expect(result.current).toBe("restart"));
  });

  it("stays null when the script is current", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        statusBody({
          installed: true,
          installedVersion: "1.2.0",
          running: true,
          runningVersion: "1.2.0",
        }),
      ),
    );

    const { result } = renderHook(() => useRemoteScriptNotice("connecting"));

    await waitForHookState(() => expect(fetchMock).toHaveBeenCalled());
    await act(() => Promise.resolve());

    expect(result.current).toBeNull();
  });

  it("stays null when the read fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("nope", { status: 404, statusText: "Not Found" }),
    );

    const { result } = renderHook(() => useRemoteScriptNotice("connecting"));

    await waitForHookState(() => expect(fetchMock).toHaveBeenCalled());
    await act(() => Promise.resolve());

    expect(result.current).toBeNull();
  });

  it("clears once Live is restarted and the window regains focus", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        statusBody({
          installed: true,
          installedVersion: "1.2.0",
          running: true,
          runningVersion: "1.1.0",
        }),
      ),
    );

    const { result } = renderHook(() => useRemoteScriptNotice("connecting"));

    await waitForHookState(() => expect(result.current).toBe("restart"));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        statusBody({
          installed: true,
          installedVersion: "1.2.0",
          running: true,
          runningVersion: "1.2.0",
        }),
      ),
    );
    await act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitForHookState(() => expect(result.current).toBeNull());
  });

  it("follows a status the Remote Script tab reads", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody(OLD_INSTALL)));

    const notice = renderHook(() => useRemoteScriptNotice("connecting"));

    await waitForHookState(() => expect(notice.result.current).toBe("update"));

    // The tab's own mount read, after an Update landed.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        statusBody({
          installed: true,
          installedVersion: "1.2.0",
          running: true,
          runningVersion: "1.1.0",
        }),
      ),
    );
    renderHook(() => useRemoteScript());

    await waitForHookState(() => expect(notice.result.current).toBe("restart"));
  });

  it("re-reads when the connection comes back, and clears the badge", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        statusBody({
          installed: true,
          installedVersion: "1.2.0",
          running: true,
          runningVersion: "1.1.0",
        }),
      ),
    );

    let mcpStatus: McpStatus = "error";
    const { result, rerender } = renderHook(() =>
      useRemoteScriptNotice(mcpStatus),
    );

    await waitForHookState(() => expect(result.current).toBe("restart"));

    // Nothing re-reads while the connection is down.
    rerender();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        statusBody({
          installed: true,
          installedVersion: "1.2.0",
          running: true,
          runningVersion: "1.2.0",
        }),
      ),
    );
    mcpStatus = "connected";
    rerender();

    await waitForHookState(() => expect(result.current).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the badge when a later read fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody(OLD_INSTALL)));

    const { result } = renderHook(() => useRemoteScriptNotice("connecting"));

    await waitForHookState(() => expect(result.current).toBe("update"));

    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));
    await act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitForHookState(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(() => Promise.resolve());

    expect(result.current).toBe("update");
  });

  it("ignores an older read that lands after a newer one", async () => {
    const first = deferred<Response>();

    fetchMock.mockReturnValueOnce(first.promise);

    const { result } = renderHook(() => useRemoteScriptNotice("connecting"));

    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody()));
    await act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitForHookState(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // The first read answers last, with a stale "update".
    await act(async () => {
      first.resolve(jsonResponse(statusBody(OLD_INSTALL)));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current).toBeNull();
  });

  it("stops listening when it unmounts", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody(OLD_INSTALL)));

    const notice = renderHook(() => useRemoteScriptNotice("connecting"));

    await waitForHookState(() => expect(notice.result.current).toBe("update"));
    notice.unmount();

    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody()));
    renderHook(() => useRemoteScript());

    await waitForHookState(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(notice.result.current).toBe("update");
  });
});
