// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { statusBody } from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";
import { useRemoteScriptNotice } from "#webui/hooks/connection/use-remote-script-notice";
import { type McpStatus } from "#webui/hooks/connection/use-mcp-connection";
import {
  deferred,
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import {
  type RemoteScriptStatus,
  useRemoteScript,
} from "#webui/hooks/settings/installation/use-remote-script";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";

const OLD_INSTALL = {
  installed: true,
  installedVersion: "1.1.0",
  updateAvailable: true,
  running: true,
  runningVersion: "1.1.0",
};
// Installed is current, but Live still runs the older copy.
const NEEDS_RESTART = {
  installed: true,
  installedVersion: "1.2.0",
  running: true,
  runningVersion: "1.1.0",
};
const CURRENT = { ...NEEDS_RESTART, runningVersion: "1.2.0" };

describe("useRemoteScriptNotice", () => {
  const fetchMock = installFetchMock();

  /**
   * Queue the next status read's answer.
   * @param fields - Status fields to change
   */
  function queueStatus(fields: Partial<RemoteScriptStatus> = {}): void {
    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody(fields)));
  }

  /**
   * Render the notice while connecting, with its first read answering this.
   * @param fields - Status fields to change
   * @returns The rendered hook
   */
  function renderNotice(fields: Partial<RemoteScriptStatus>) {
    queueStatus(fields);

    return renderHook(() => useRemoteScriptNotice("connecting"));
  }

  it("is null until the status lands", () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useRemoteScriptNotice("connecting"));

    expect(result.current).toBeNull();
  });

  it("asks for an update when the installed script is older than this build", async () => {
    const { result } = renderNotice(OLD_INSTALL);

    await waitForHookState(() => expect(result.current).toBe("update"));
  });

  it("asks for a restart when Live runs an older copy than the installed one", async () => {
    const { result } = renderNotice(NEEDS_RESTART);

    await waitForHookState(() => expect(result.current).toBe("restart"));
  });

  it.each([
    ["the script is current", () => jsonResponse(statusBody(CURRENT))],
    [
      "the read fails",
      () => new Response("nope", { status: 404, statusText: "Not Found" }),
    ],
  ])("stays null when %s", async (_, response) => {
    fetchMock.mockResolvedValueOnce(response());

    const { result } = renderHook(() => useRemoteScriptNotice("connecting"));

    await waitForHookState(() => expect(fetchMock).toHaveBeenCalled());
    await act(() => Promise.resolve());

    expect(result.current).toBeNull();
  });

  it("clears once Live is restarted and the window regains focus", async () => {
    const { result } = renderNotice(NEEDS_RESTART);

    await waitForHookState(() => expect(result.current).toBe("restart"));

    queueStatus(CURRENT);
    await act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitForHookState(() => expect(result.current).toBeNull());
  });

  it("follows a status the Installation tab reads", async () => {
    const notice = renderNotice(OLD_INSTALL);

    await waitForHookState(() => expect(notice.result.current).toBe("update"));

    // The tab's own mount read, after an Update landed.
    queueStatus(NEEDS_RESTART);
    renderHook(() => useRemoteScript());

    await waitForHookState(() => expect(notice.result.current).toBe("restart"));
  });

  it("re-reads when the connection comes back, and clears the badge", async () => {
    queueStatus(NEEDS_RESTART);

    let mcpStatus: McpStatus = "error";
    const { result, rerender } = renderHook(() =>
      useRemoteScriptNotice(mcpStatus),
    );

    await waitForHookState(() => expect(result.current).toBe("restart"));

    // Nothing re-reads while the connection is down.
    rerender();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    queueStatus(CURRENT);
    mcpStatus = "connected";
    rerender();

    await waitForHookState(() => expect(result.current).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the badge when a later read fails", async () => {
    const { result } = renderNotice(OLD_INSTALL);

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

    queueStatus();
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
    const notice = renderNotice(OLD_INSTALL);

    await waitForHookState(() => expect(notice.result.current).toBe("update"));
    notice.unmount();

    queueStatus();
    renderHook(() => useRemoteScript());

    await waitForHookState(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(notice.result.current).toBe("update");
  });
});
