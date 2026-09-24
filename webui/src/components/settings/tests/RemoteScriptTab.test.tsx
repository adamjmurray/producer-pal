// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { RemoteScriptTab } from "#webui/components/settings/RemoteScriptTab";
import { type RemoteScriptStatus } from "#webui/hooks/settings/use-remote-script";

const USER_LIBRARY = "/Users/me/Music/Ableton/User Library";

describe("RemoteScriptTab", () => {
  const fetchMock = installFetchMock();

  /**
   * A `GET /remote-script` body: not installed, with a User Library detected.
   * @param overrides - Fields to change
   * @returns The status body
   */
  function statusBody(
    overrides: Partial<RemoteScriptStatus> = {},
  ): RemoteScriptStatus {
    return {
      userLibrary: USER_LIBRARY,
      installed: false,
      installedVersion: null,
      bundledVersion: "1.2.0",
      running: false,
      runningVersion: null,
      liveVersion: "12.1",
      updateAvailable: false,
      installedNewer: false,
      ...overrides,
    };
  }

  /**
   * Render the tab past its mount read.
   * @param overrides - Status fields to change
   * @returns The summary line's text
   */
  async function renderTab(
    overrides: Partial<RemoteScriptStatus> = {},
  ): Promise<string | null> {
    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody(overrides)));
    render(<RemoteScriptTab />);

    const summary = await waitForHookState(() =>
      screen.getByTestId("remote-script-status"),
    );

    return summary.textContent;
  }

  it("shows a loading state until the status lands", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    render(<RemoteScriptTab />);

    expect(screen.getByTestId("remote-script-loading")).toBeTruthy();
  });

  it("surfaces a failed status read and re-reads on Refresh", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("nope", { status: 500, statusText: "Server Error" }),
    );
    render(<RemoteScriptTab />);

    const error = await waitForHookState(() =>
      screen.getByTestId("remote-script-load-error"),
    );

    expect(error.textContent).toContain("Remote script status failed");

    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody()));
    fireEvent.click(screen.getByTestId("remote-script-refresh"));

    const summary = await waitForHookState(() =>
      screen.getByTestId("remote-script-status"),
    );

    expect(summary.textContent).toBe("Not installed");
  });

  it("prefills the detected User Library and offers Install", async () => {
    const summary = await renderTab();

    expect(summary).toBe("Not installed");
    expect(
      (screen.getByTestId("remote-script-path") as HTMLInputElement).value,
    ).toBe(USER_LIBRARY);
    expect(screen.getByTestId("remote-script-install").textContent).toBe(
      "Install",
    );
    expect(screen.queryByTestId("remote-script-steps")).toBeNull();
  });

  it("installs, shows the path, and then shows the enable steps", async () => {
    await renderTab();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        path: `${USER_LIBRARY}/Remote Scripts/Producer_Pal`,
        version: "1.2.0",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(statusBody({ installed: true, installedVersion: "1.2.0" })),
    );
    fireEvent.click(screen.getByTestId("remote-script-install"));

    // The steps only render once the post-install status read has landed.
    const steps = (await waitForHookState(() =>
      screen.getByTestId("remote-script-steps"),
    )) as HTMLDetailsElement;

    expect(
      screen.getByTestId("remote-script-installed-path").textContent,
    ).toContain(`${USER_LIBRARY}/Remote Scripts/Producer_Pal`);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/remote-script/install"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userLibrary: USER_LIBRARY }),
      }),
    );

    expect(steps.open).toBe(true);
    expect(steps.textContent).toContain("Restart Live");
    expect(screen.getByTestId("remote-script-status").textContent).toBe(
      "Installed v1.2.0 (not running)",
    );
  });

  it("shows the server's reason when the install is refused", async () => {
    await renderTab({ userLibrary: null });

    const input = screen.getByTestId("remote-script-path");

    fireEvent.input(input, { target: { value: "/nope" } });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "No such directory: /nope" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    fireEvent.click(screen.getByTestId("remote-script-install"));

    const error = await waitForHookState(() =>
      screen.getByTestId("remote-script-error"),
    );

    expect(error.textContent).toBe("No such directory: /nope");
    expect(screen.queryByTestId("remote-script-installed-path")).toBeNull();
  });

  it("asks for the path when no User Library was detected", async () => {
    await renderTab({ userLibrary: null });

    expect(
      (screen.getByTestId("remote-script-path") as HTMLInputElement).value,
    ).toBe("");
    // Install has nothing to write until the user pastes a path.
    expect(
      (screen.getByTestId("remote-script-install") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByTestId("remote-script-tab").textContent).toContain(
      "Location of User Library",
    );
  });

  it("offers Update when this build ships a newer version", async () => {
    const summary = await renderTab({
      installed: true,
      installedVersion: "1.1.0",
      running: true,
      runningVersion: "1.1.0",
      updateAvailable: true,
    });

    expect(summary).toBe(
      "Update available: installed v1.1.0, this build has v1.2.0 (running v1.1.0 in Live 12.1)",
    );
    expect(screen.getByTestId("remote-script-install").textContent).toBe(
      "Update",
    );
  });

  it("offers a downgrade, not an Update, when the installed version is newer", async () => {
    const summary = await renderTab({
      installed: true,
      installedVersion: "1.3.0",
      running: true,
      runningVersion: "1.3.0",
      installedNewer: true,
    });

    expect(summary).toBe(
      "Installed v1.3.0 is newer than this device's v1.2.0 (running v1.3.0 in Live 12.1)",
    );
    expect(screen.getByTestId("remote-script-install").textContent).toBe(
      "Downgrade to match",
    );
  });

  it("says so when Live runs a script installed somewhere else", async () => {
    const summary = await renderTab({
      running: true,
      runningVersion: "1.1.0",
    });

    expect(summary).toBe(
      "Not installed here, but Live 12.1 is running v1.1.0 from another location",
    );
  });

  it("never shows a vnull version", async () => {
    const summary = await renderTab({
      installed: true,
      installedVersion: null,
      updateAvailable: true,
    });

    expect(summary).toBe(
      "Update available: installed an unknown version, this build has v1.2.0 (not running)",
    );
  });

  it("keeps the steps open until Live runs the installed version", async () => {
    await renderTab({
      installed: true,
      installedVersion: "1.2.0",
      running: true,
      runningVersion: "1.1.0",
    });

    expect(
      (screen.getByTestId("remote-script-steps") as HTMLDetailsElement).open,
    ).toBe(true);
    expect(screen.getByTestId("remote-script-restart").textContent).toBe(
      "Restart Live to load v1.2.0.",
    );
  });

  it("fills in a User Library a later Refresh finds", async () => {
    await renderTab({ userLibrary: null });

    fetchMock.mockResolvedValueOnce(jsonResponse(statusBody()));
    fireEvent.click(screen.getByTestId("remote-script-refresh"));

    await waitForHookState(() =>
      expect(
        (screen.getByTestId("remote-script-path") as HTMLInputElement).value,
      ).toBe(USER_LIBRARY),
    );
  });

  it.each([
    {
      what: "reports an HTML error page as a failed install",
      body: "<html>Not Found</html>",
      status: 404,
      contentType: "text/html",
      expected: "Install failed (404)",
    },
    {
      what: "reports a truncated JSON error body by status",
      body: '{"error":',
      status: 500,
      contentType: "application/json",
      expected: "Install failed (500)",
    },
  ])("$what", async ({ body, status, contentType, expected }) => {
    await renderTab();

    fetchMock.mockResolvedValueOnce(
      new Response(body, { status, headers: { "Content-Type": contentType } }),
    );
    fireEvent.click(screen.getByTestId("remote-script-install"));

    const error = await waitForHookState(() =>
      screen.getByTestId("remote-script-error"),
    );

    expect(error.textContent).toBe(expected);
  });

  it("refuses to guess the path when a 200 leaves it out", async () => {
    await renderTab();

    fetchMock.mockResolvedValueOnce(jsonResponse({ version: "1.2.0" }));
    fireEvent.click(screen.getByTestId("remote-script-install"));

    const error = await waitForHookState(() =>
      screen.getByTestId("remote-script-error"),
    );

    expect(error.textContent).toBe(
      "Install failed: the server didn't say where",
    );
    expect(screen.queryByTestId("remote-script-installed-path")).toBeNull();
  });

  it("collapses the steps once Live is running the script", async () => {
    const summary = await renderTab({
      installed: true,
      installedVersion: "1.2.0",
      running: true,
      runningVersion: "1.2.0",
    });

    expect(summary).toBe("Installed v1.2.0 (running v1.2.0 in Live 12.1)");
    expect(
      (screen.getByTestId("remote-script-steps") as HTMLDetailsElement).open,
    ).toBe(false);
    expect(screen.getByTestId("remote-script-install").textContent).toBe(
      "Reinstall",
    );
  });
  it("falls back to generic copy when the read answers nothing", async () => {
    // A 200 with a null body: no status to show and no error to quote.
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    render(<RemoteScriptTab />);

    const error = await waitForHookState(() =>
      screen.getByTestId("remote-script-load-error"),
    );

    expect(error.textContent).toBe("Could not read the remote script status.");
  });

  it("omits the Live version when the server didn't report one", async () => {
    const summary = await renderTab({
      installed: true,
      installedVersion: "1.2.0",
      running: true,
      runningVersion: "1.2.0",
      liveVersion: null,
    });

    expect(summary).toBe("Installed v1.2.0 (running v1.2.0)");
  });

  it("omits the Live version from the installed-elsewhere summary too", async () => {
    const summary = await renderTab({
      running: true,
      runningVersion: "1.1.0",
      liveVersion: null,
    });

    expect(summary).toBe(
      "Not installed here, but Live is running v1.1.0 from another location",
    );
  });
});
