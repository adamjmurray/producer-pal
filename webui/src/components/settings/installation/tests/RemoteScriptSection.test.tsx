// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { jsonResponse } from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { InstallationTabHarness } from "#webui/components/settings/installation/tests/helpers/InstallationTabHarness";
import { type RemoteScriptStatus } from "#webui/hooks/settings/installation/use-remote-script";
import { deviceStatusBody } from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";
import {
  statusBody,
  USER_LIBRARY,
} from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";
import {
  renderRemoteScriptTab,
  setupInstallationTab,
} from "#webui/components/settings/installation/tests/helpers/installation-tab-test-helpers";

describe("InstallationTab remote script section", () => {
  const { fetchMock, routes } = setupInstallationTab();

  /**
   * Render the tab past its mount read.
   * @param overrides - Status fields to change
   * @returns The summary line's text
   */
  async function renderTab(
    overrides: Partial<RemoteScriptStatus> = {},
  ): Promise<string | null> {
    // Either status can find the User Library, so a test about not finding it
    // needs the device to fail too.
    if (overrides.userLibrary === null) {
      routes.device(jsonResponse(deviceStatusBody({ userLibrary: null })));
    }

    const summary = await renderRemoteScriptTab(routes, overrides);

    return summary.textContent;
  }

  it("shows a loading state until the status lands", async () => {
    routes.remote(new Promise(() => {}));
    render(<InstallationTabHarness />);

    expect(screen.getByTestId("remote-script-loading")).toBeTruthy();
  });

  it("surfaces a failed status read and re-reads on Refresh", async () => {
    routes.remote(
      new Response("nope", { status: 500, statusText: "Server Error" }),
    );
    render(<InstallationTabHarness />);

    const error = await waitForHookState(() =>
      screen.getByTestId("remote-script-load-error"),
    );

    expect(error.textContent).toContain("Remote script status failed");

    routes.remote(jsonResponse(statusBody()));
    fireEvent.click(screen.getByTestId("remote-script-refresh"));

    const summary = await waitForHookState(() =>
      screen.getByTestId("remote-script-status"),
    );

    expect(summary.textContent).toBe("Not installed");
  });

  it("keeps the last status and shows the error when a Refresh fails", async () => {
    await renderTab();

    routes.remote(new Error("Failed to fetch"));
    fireEvent.click(screen.getByTestId("remote-script-refresh"));

    const error = await waitForHookState(() =>
      screen.getByTestId("remote-script-load-error"),
    );

    expect(error.textContent).toBe("Failed to fetch");
    expect(screen.getByTestId("remote-script-status").textContent).toBe(
      "Not installed",
    );

    routes.remote(jsonResponse(statusBody()));
    fireEvent.click(screen.getByTestId("remote-script-refresh"));

    await waitForHookState(() => {
      expect(screen.queryByTestId("remote-script-load-error")).toBeNull();
    });
  });

  it("prefills the detected User Library and offers Install", async () => {
    const summary = await renderTab();

    expect(summary).toBe("Not installed");
    expect(
      (screen.getByTestId("user-library-path") as HTMLInputElement).value,
    ).toBe(USER_LIBRARY);
    expect(screen.getByTestId("remote-script-install").textContent).toBe(
      "Install",
    );
    expect(screen.queryByTestId("remote-script-steps")).toBeNull();
  });

  it("installs, shows the path, and then shows the enable steps", async () => {
    await renderTab();

    routes.remote(
      jsonResponse({
        path: `${USER_LIBRARY}/Remote Scripts/Producer_Pal`,
        version: "1.2.0",
      }),
    );
    routes.remote(
      jsonResponse(statusBody({ installed: true, installedVersion: "1.2.0" })),
    );
    fireEvent.click(screen.getByTestId("remote-script-install"));

    // The steps only render once the post-install status read has landed.
    const steps = await waitForHookState(() =>
      screen.getByTestId("remote-script-steps"),
    );

    expect(
      screen.getByTestId("remote-script-installed-path").textContent,
    ).toContain(`${USER_LIBRARY}/Remote Scripts/Producer_Pal`);
    expect(screen.getByTestId("remote-script-new-chat-hint").textContent).toBe(
      "After restarting Live, start a new chat so it picks up the new version.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/remote-script/install"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userLibrary: USER_LIBRARY }),
      }),
    );

    // Expanded: a section, not the collapsed <details>.
    expect(steps.tagName).toBe("DIV");
    expect(steps.textContent).toContain("Restart Live");
    expect(screen.getByTestId("remote-script-status").textContent).toBe(
      "Installed v1.2.0 (not running)",
    );
  });

  it("shows the server's reason when the install is refused", async () => {
    await renderTab({ userLibrary: null });

    const input = screen.getByTestId("user-library-path");

    fireEvent.input(input, { target: { value: "/nope" } });
    routes.remote(
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
    expect(screen.queryByTestId("remote-script-new-chat-hint")).toBeNull();
  });

  it("asks for the path when no User Library was detected", async () => {
    await renderTab({ userLibrary: null });

    expect(
      (screen.getByTestId("user-library-path") as HTMLInputElement).value,
    ).toBe("");
    // Install has nothing to write until the user pastes a path.
    expect(
      (screen.getByTestId("remote-script-install") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByTestId("installation-tab").textContent).toContain(
      "Location of User Library",
    );
  });

  it("offers Update for another build of this version", async () => {
    const summary = await renderTab({
      installed: true,
      installedVersion: "1.2.0",
      running: true,
      runningVersion: "1.2.0",
      updateAvailable: true,
    });

    expect(summary).toBe(
      "Update available: installed v1.2.0 is a different build than this device's (running v1.2.0 in Live 12.1)",
    );
    expect(screen.getByTestId("remote-script-install").textContent).toBe(
      "Update",
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

    expect(screen.getByTestId("remote-script-steps").tagName).toBe("DIV");
    expect(screen.getByTestId("remote-script-status").textContent).toBe(
      "Installed v1.2.0 (running v1.1.0 in Live 12.1; restart Live to load it)",
    );
  });

  it("asks for a restart when Live runs a newer copy than the installed one", async () => {
    await renderTab({
      installed: true,
      installedVersion: "1.2.0",
      running: true,
      runningVersion: "1.3.0",
    });

    expect(screen.getByTestId("remote-script-status").textContent).toBe(
      "Installed v1.2.0 (running v1.3.0 in Live 12.1; restart Live to load it)",
    );
  });

  it("asks for a restart between two pre-releases of one version", async () => {
    await renderTab({
      installed: true,
      installedVersion: "1.2.0-rc2",
      running: true,
      runningVersion: "1.2.0-rc1",
    });

    expect(screen.getByTestId("remote-script-status").textContent).toBe(
      "Installed v1.2.0-rc2 (running v1.2.0-rc1 in Live 12.1; restart Live to load it)",
    );
  });

  it("asks for a restart when Live runs another build of the same version", async () => {
    await renderTab({
      installed: true,
      installedVersion: "1.2.0",
      installedBuild: "new",
      running: true,
      runningVersion: "1.2.0",
      runningBuild: "old",
    });

    expect(screen.getByTestId("remote-script-status").textContent).toBe(
      "Installed v1.2.0 (restart Live to load it)",
    );
  });

  it("offers a plain Install for a typed path the status doesn't describe", async () => {
    await renderTab({
      installed: true,
      installedVersion: "1.1.0",
      updateAvailable: true,
    });

    const install = screen.getByTestId("remote-script-install");

    expect(install.textContent).toBe("Update");

    fireEvent.input(screen.getByTestId("user-library-path"), {
      target: { value: "/elsewhere" },
    });

    await waitForHookState(() => expect(install.textContent).toBe("Install"));
  });

  it("keeps a typed path when a Refresh finds a different User Library", async () => {
    await renderTab({ userLibrary: null });

    fireEvent.input(screen.getByTestId("user-library-path"), {
      target: { value: "/mine" },
    });
    routes.remote(jsonResponse(statusBody()));
    fireEvent.click(screen.getByTestId("remote-script-refresh"));

    await waitForHookState(() =>
      expect(screen.queryByText(/Location of User Library/)).toBeNull(),
    );
    expect(
      (screen.getByTestId("user-library-path") as HTMLInputElement).value,
    ).toBe("/mine");
  });

  it('drops "Installed to" when the follow-up status read fails', async () => {
    await renderTab();

    routes.remote(
      jsonResponse({ path: `${USER_LIBRARY}/Remote Scripts/Producer_Pal` }),
    );
    routes.remote(new Error("Failed to fetch"));
    fireEvent.click(screen.getByTestId("remote-script-install"));

    await waitForHookState(() =>
      screen.getByTestId("remote-script-load-error"),
    );
    expect(screen.queryByTestId("remote-script-installed-path")).toBeNull();
  });

  it("fills in a User Library a later Refresh finds", async () => {
    await renderTab({ userLibrary: null });

    routes.remote(jsonResponse(statusBody()));
    fireEvent.click(screen.getByTestId("remote-script-refresh"));

    await waitForHookState(() =>
      expect(
        (screen.getByTestId("user-library-path") as HTMLInputElement).value,
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

    routes.remote(
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

    routes.remote(jsonResponse({ version: "1.2.0" }));
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
    routes.remote(jsonResponse(null));
    render(<InstallationTabHarness />);

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

  it("doesn't mention another program on the port when nothing is installed", async () => {
    const summary = await renderTab({ otherOnPort: 3349 });

    expect(summary).toBe("Not installed");
  });

  it("says it again for an installed script that isn't running", async () => {
    const summary = await renderTab({
      installed: true,
      installedVersion: "1.2.0",
      otherOnPort: 3351,
    });

    expect(summary).toBe(
      "Installed v1.2.0 (not running; another program answers on port 3351)",
    );
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
