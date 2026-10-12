// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { InstallationTab } from "#webui/components/settings/installation/InstallationTab";
import { type DeviceInstallStatus } from "#webui/hooks/settings/installation/use-device-install";
import {
  DEVICE_PATH,
  deviceStatusBody,
  routeInstallationFetch,
} from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";
import {
  statusBody,
  USER_LIBRARY,
} from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";

const INSTALL_DONE = {
  outcome: "installed",
  path: DEVICE_PATH,
  detail: "Installed the device.",
};

describe("InstallationTab device section", () => {
  const fetchMock = installFetchMock();
  let routes: ReturnType<typeof routeInstallationFetch>;

  beforeEach(() => {
    routes = routeInstallationFetch(fetchMock);
  });

  /**
   * Render the tab past the device's mount read.
   * @param overrides - Status fields to change
   * @returns The device summary line's text
   */
  async function renderDevice(
    overrides: Partial<DeviceInstallStatus> = {},
  ): Promise<string | null> {
    routes.device(jsonResponse(deviceStatusBody(overrides)));
    render(<InstallationTab />);

    const summary = await waitForHookState(() =>
      screen.getByTestId("device-status"),
    );

    return summary.textContent;
  }

  /**
   * @returns The device's install button text, or null when there is none
   */
  function installLabel(): string | null {
    return screen.queryByTestId("device-install")?.textContent ?? null;
  }

  it("shows the shared path field above both sections", async () => {
    await renderDevice();

    const field = screen.getByTestId("user-library-path") as HTMLInputElement;

    expect(field.value).toBe(USER_LIBRARY);
    expect(
      screen.getByTestId("installation-tab").firstElementChild?.contains(field),
    ).toBe(true);
    expect(screen.getByTestId("device-section")).toBeTruthy();
    expect(screen.getByTestId("remote-script-section")).toBeTruthy();
  });

  it("offers Install when the User Library has no copy", async () => {
    expect(await renderDevice()).toBe("Not in your User Library");
    expect(installLabel()).toBe("Install");
  });

  it("installs, shows what was done, and drops the button once current", async () => {
    await renderDevice();

    routes.device(
      jsonResponse(INSTALL_DONE),
      jsonResponse(
        deviceStatusBody({ state: "same", installedVersion: "1.2.0" }),
      ),
    );
    fireEvent.click(screen.getByTestId("device-install"));

    const done = await waitForHookState(() =>
      screen.getByTestId("device-installed-path"),
    );

    expect(done.textContent).toBe(`Installed the device. (${DEVICE_PATH})`);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/device-install/install"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userLibrary: USER_LIBRARY, force: false }),
      }),
    );
    await waitForHookState(() => {
      expect(screen.getByTestId("device-status").textContent).toBe(
        "The copy in your User Library is this device (v1.2.0)",
      );
    });
    expect(installLabel()).toBeNull();
  });

  it("offers Update for an older copy", async () => {
    const summary = await renderDevice({
      state: "installed-older",
      installedVersion: "1.1.0",
    });

    expect(summary).toBe(
      "Update available: your User Library has v1.1.0, this device is v1.2.0",
    );
    expect(installLabel()).toBe("Update");
  });

  it("asks before replacing a newer copy, and sends force", async () => {
    const summary = await renderDevice({
      state: "installed-newer",
      installedVersion: "1.3.0",
    });

    expect(summary).toBe(
      "The copy in your User Library (v1.3.0) is newer than this device (v1.2.0)",
    );
    expect(installLabel()).toBe("Replace with this device");

    routes.device(jsonResponse({ ...INSTALL_DONE, outcome: "updated" }));
    fireEvent.click(screen.getByTestId("device-install"));

    await waitForHookState(() => screen.getByTestId("device-installed-path"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/device-install/install"),
      expect.objectContaining({
        body: JSON.stringify({ userLibrary: USER_LIBRARY, force: true }),
      }),
    );
  });

  it("describes a copy that can't be ordered, without saying vnull", async () => {
    const summary = await renderDevice({
      state: "different",
      installedVersion: null,
    });

    expect(summary).toBe(
      "The copy in your User Library (an unknown version) differs from this device (v1.2.0)",
    );
    expect(installLabel()).toBe("Replace with this device");
  });

  it("offers a plain Install for a typed path the status doesn't describe", async () => {
    await renderDevice({ state: "installed-newer", installedVersion: "1.3.0" });

    fireEvent.input(screen.getByTestId("user-library-path"), {
      target: { value: "/elsewhere" },
    });
    await waitForHookState(() => expect(installLabel()).toBe("Install"));

    routes.device(jsonResponse(INSTALL_DONE));
    fireEvent.click(screen.getByTestId("device-install"));

    await waitForHookState(() => screen.getByTestId("device-installed-path"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/device-install/install"),
      expect.objectContaining({
        body: JSON.stringify({ userLibrary: "/elsewhere", force: false }),
      }),
    );
  });

  it("keeps the Install button for a typed path even when the detected copy is current", async () => {
    await renderDevice({ state: "same", installedVersion: "1.2.0" });
    expect(installLabel()).toBeNull();

    fireEvent.input(screen.getByTestId("user-library-path"), {
      target: { value: "/elsewhere" },
    });
    await waitForHookState(() => expect(installLabel()).toBe("Install"));
  });

  it.each([
    {
      problem: "unknown-source" as const,
      text: "This device hasn't said where its file is yet. Try Refresh in a moment.",
    },
    {
      problem: "unreadable-source" as const,
      text: "This device's file can't be read.",
    },
    {
      problem: "not-frozen" as const,
      text: "This is a development device, which needs the files beside it, so it can't be copied. Freeze it first.",
    },
  ])("offers no install when $problem", async ({ problem, text }) => {
    const summary = await renderDevice({ problem, state: null, path: null });

    expect(summary).toBe(text);
    expect(installLabel()).toBeNull();
    expect(screen.queryByTestId("device-refresh") != null).toBe(
      problem === "unknown-source",
    );
  });

  it("re-reads the status on Refresh when the device hasn't said where it is", async () => {
    await renderDevice({ problem: "unknown-source", state: null, path: null });

    routes.device(jsonResponse(deviceStatusBody()));
    fireEvent.click(screen.getByTestId("device-refresh"));

    await waitForHookState(() => {
      expect(screen.getByTestId("device-status").textContent).toBe(
        "Not in your User Library",
      );
    });
  });

  it("takes a pasted path when no User Library was found", async () => {
    routes.remote(jsonResponse(statusBody({ userLibrary: null })));

    const summary = await renderDevice({
      problem: "no-user-library",
      userLibrary: null,
      state: null,
      path: null,
    });

    expect(summary).toBe("Enter your User Library above to check for a copy.");
    expect(
      (screen.getByTestId("device-install") as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.input(screen.getByTestId("user-library-path"), {
      target: { value: "/mine" },
    });

    await waitForHookState(() => {
      expect(
        (screen.getByTestId("device-install") as HTMLButtonElement).disabled,
      ).toBe(false);
    });
  });

  it("lists other copies in the User Library", async () => {
    await renderDevice({ otherCopies: ["/lib/a.amxd", "/lib/b.amxd"] });

    expect(screen.getByTestId("device-other-copies").textContent).toContain(
      "/lib/a.amxd, /lib/b.amxd",
    );
  });

  it("shows the server's reason when the install is refused", async () => {
    await renderDevice();

    routes.device(
      new Response(JSON.stringify({ error: "Freeze it first." }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    fireEvent.click(screen.getByTestId("device-install"));

    const error = await waitForHookState(() =>
      screen.getByTestId("device-error"),
    );

    expect(error.textContent).toBe("Freeze it first.");
    expect(screen.queryByTestId("device-installed-path")).toBeNull();
  });

  it.each([
    {
      what: "an HTML error page",
      response: () =>
        new Response("<html>Not Found</html>", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }),
      expected: "Install failed (404)",
    },
    {
      what: "a truncated JSON error body",
      response: () =>
        new Response('{"error":', {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      expected: "Install failed (500)",
    },
    {
      what: "a 200 that says nothing",
      response: () => jsonResponse({}),
      expected: "Install failed: the server didn't say what it did",
    },
    {
      what: "a dropped connection",
      response: () => new Error("Failed to fetch"),
      expected: "Failed to fetch",
    },
  ])("reports $what as a failed install", async ({ response, expected }) => {
    await renderDevice();

    routes.device(response());
    fireEvent.click(screen.getByTestId("device-install"));

    const error = await waitForHookState(() =>
      screen.getByTestId("device-error"),
    );

    expect(error.textContent).toBe(expected);
  });

  it("surfaces a failed status read and re-reads on Refresh", async () => {
    routes.device(new Response("nope", { status: 500, statusText: "Oops" }));
    render(<InstallationTab />);

    const error = await waitForHookState(() =>
      screen.getByTestId("device-load-error"),
    );

    expect(error.textContent).toBe("Device install status failed (500 Oops)");

    routes.device(jsonResponse(deviceStatusBody()));
    fireEvent.click(screen.getByTestId("device-refresh"));

    await waitForHookState(() => screen.getByTestId("device-status"));
  });

  it("keeps the last status and shows the error when a Refresh fails", async () => {
    await renderDevice({ problem: "unknown-source", state: null, path: null });

    routes.device(new Error("Failed to fetch"));
    fireEvent.click(screen.getByTestId("device-refresh"));

    const error = await waitForHookState(() =>
      screen.getByTestId("device-load-error"),
    );

    expect(error.textContent).toBe("Failed to fetch");
    expect(screen.getByTestId("device-status")).toBeTruthy();
  });

  it("falls back to generic copy when the read answers nothing", async () => {
    routes.device(jsonResponse(null));
    render(<InstallationTab />);

    const error = await waitForHookState(() =>
      screen.getByTestId("device-load-error"),
    );

    expect(error.textContent).toBe("Could not read the device status.");
  });

  it("shows a loading state until the status lands", () => {
    routes.device(new Promise(() => {}));
    render(<InstallationTab />);

    expect(screen.getByTestId("device-loading")).toBeTruthy();
  });
});
