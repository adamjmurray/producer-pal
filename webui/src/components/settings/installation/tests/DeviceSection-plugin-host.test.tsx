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
import { InstallationTabHarness } from "#webui/components/settings/installation/tests/helpers/InstallationTabHarness";
import { type DeviceInstallStatus } from "#webui/hooks/settings/installation/use-device-install";
import {
  DEVICE_PATH,
  deviceStatusBody,
  routeInstallationFetch,
} from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";

const WRAPPER_PATH = "/lib/PPal Plug-in Effect.amxd";
const MISSING = [
  { name: "PPal Plug-in Effect", path: WRAPPER_PATH, state: "missing" },
  { name: "PPal Plug-in Instrument", path: "/lib/i.amxd", state: "current" },
] as const;
const CURRENT = MISSING.map((w) => ({ ...w, state: "current" as const }));

describe("InstallationTab device section: plug-in host devices", () => {
  const fetchMock = installFetchMock();
  let routes: ReturnType<typeof routeInstallationFetch>;

  beforeEach(() => {
    routes = routeInstallationFetch(fetchMock);
  });

  /**
   * @param overrides - Status fields to change from a current device
   */
  async function renderDevice(
    overrides: Partial<DeviceInstallStatus> = {},
  ): Promise<void> {
    routes.device(
      jsonResponse(
        deviceStatusBody({
          state: "same",
          installedVersion: "1.2.0",
          ...overrides,
        }),
      ),
    );
    render(<InstallationTabHarness />);
    await waitForHookState(() => {
      expect(screen.queryByTestId("device-loading")).toBeNull();
    });
  }

  const installLabel = (): string | null =>
    screen.queryByTestId("device-install")?.textContent ?? null;

  it("offers to install them when only they are missing", async () => {
    await renderDevice({ pluginHost: [...MISSING] });

    expect(installLabel()).toBe("Install the plug-in wrapper devices");
    expect(screen.getByTestId("device-plugin-host").textContent).toBe(
      "Plug-in wrapper devices: PPal Plug-in Effect is not installed; PPal Plug-in Instrument is installed",
    );
  });

  it("offers it for a wrapper that differs from this build's", async () => {
    await renderDevice({
      pluginHost: [{ ...MISSING[0], state: "differs" }, MISSING[1]],
    });

    expect(installLabel()).toBe("Install the plug-in wrapper devices");
    expect(screen.getByTestId("device-plugin-host").textContent).toContain(
      "PPal Plug-in Effect differs from this build",
    );
  });

  it("offers nothing when the device and the wrappers are current", async () => {
    await renderDevice({ pluginHost: [...CURRENT] });

    expect(installLabel()).toBeNull();
    expect(screen.getByTestId("device-plugin-host").textContent).toBe(
      "Plug-in wrapper devices: installed",
    );
  });

  it("keeps the device's own label when the device needs installing too", async () => {
    await renderDevice({ state: "not-installed", pluginHost: [...MISSING] });

    expect(installLabel()).toBe("Copy");
  });

  it("shows them for a development build", async () => {
    await renderDevice({
      problem: "not-frozen",
      state: null,
      pluginHost: [...MISSING],
    });

    expect(screen.getByTestId("device-plugin-host").textContent).toBe(
      "Plug-in wrapper devices: PPal Plug-in Effect is not installed; PPal Plug-in Instrument is installed",
    );
  });

  it("shows a development build's current wrappers as installed", async () => {
    await renderDevice({
      problem: "not-frozen",
      state: null,
      pluginHost: [...CURRENT],
    });

    expect(screen.getByTestId("device-plugin-host").textContent).toBe(
      "Plug-in wrapper devices: installed",
    );
    expect(installLabel()).toBe("Copy");
    expect(
      (screen.getByTestId("device-install") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("says nothing about them when the device has another problem", async () => {
    await renderDevice({
      problem: "unreadable-source",
      state: null,
      pluginHost: [...MISSING],
    });

    expect(screen.queryByTestId("device-plugin-host")).toBeNull();
  });

  it("says nothing about them when the server reports none", async () => {
    await renderDevice();

    expect(installLabel()).toBeNull();
    expect(screen.queryByTestId("device-plugin-host")).toBeNull();
  });

  it("shows what the install did to each wrapper, then drops the button", async () => {
    await renderDevice({ pluginHost: [...MISSING] });

    const detail =
      "The installed device is already this one. Plug-in wrapper devices: PPal Plug-in Effect installed; PPal Plug-in Instrument already installed.";

    routes.device(
      jsonResponse({
        outcome: "current",
        path: DEVICE_PATH,
        detail,
        pluginHost: [
          { name: "PPal Plug-in Effect", status: "installed", path: "/p" },
        ],
      }),
      jsonResponse(deviceStatusBody({ state: "same", pluginHost: CURRENT })),
    );
    fireEvent.click(screen.getByTestId("device-install"));

    const done = await waitForHookState(() =>
      screen.getByTestId("device-installed-path"),
    );

    expect(done.textContent).toBe(`${detail} (${DEVICE_PATH})`);
    expect(done.className).not.toContain("amber");
    await waitForHookState(() => {
      expect(installLabel()).toBeNull();
    });
  });

  it("flags a wrapper that failed to install", async () => {
    await renderDevice({ pluginHost: [...MISSING] });
    routes.device(
      jsonResponse({
        outcome: "current",
        path: DEVICE_PATH,
        detail:
          "Plug-in wrapper devices: PPal Plug-in Effect failed: close any Set that uses it, or quit Live, then click Install.",
        pluginHost: [{ name: "PPal Plug-in Effect", ok: false, path: "/p" }],
      }),
      jsonResponse(
        deviceStatusBody({ state: "same", pluginHost: [...MISSING] }),
      ),
    );
    fireEvent.click(screen.getByTestId("device-install"));

    const done = await waitForHookState(() =>
      screen.getByTestId("device-installed-path"),
    );

    expect(done.className).toContain("amber");
    expect(done.textContent).toContain("then click Install.");
  });

  it("ignores the wrappers for a path the status doesn't describe", async () => {
    await renderDevice({ pluginHost: [...MISSING] });

    fireEvent.input(screen.getByTestId("user-library-path"), {
      target: { value: "/elsewhere" },
    });

    await waitForHookState(() => {
      expect(screen.queryByTestId("device-plugin-host")).toBeNull();
    });
    expect(installLabel()).toBe("Copy");
  });
});

describe("InstallationTab device section: plug-in wrapper devices on a development build", () => {
  const fetchMock = installFetchMock();
  let routes: ReturnType<typeof routeInstallationFetch>;

  beforeEach(() => {
    routes = routeInstallationFetch(fetchMock);
  });

  const DEV: Partial<DeviceInstallStatus> = {
    problem: "not-frozen",
    state: null,
    path: null,
    pluginHost: [...MISSING],
  };

  /** Render a development device whose wrappers aren't all in. */
  async function renderDev(): Promise<void> {
    routes.device(jsonResponse(deviceStatusBody({ ...DEV })));
    render(<InstallationTabHarness />);
    await waitForHookState(() => {
      expect(screen.queryByTestId("device-loading")).toBeNull();
    });
  }

  /**
   * Click the install button and wait for its POST to settle.
   * @param answer - What the wrapper route answers
   * @param after - The status read that follows, when the POST is a 2xx
   */
  async function clickInstall(
    answer: Response | Error,
    after: Response = jsonResponse(deviceStatusBody({ ...DEV })),
  ): Promise<void> {
    routes.device(answer, after);
    fireEvent.click(screen.getByTestId("device-install"));
    await waitForHookState(() => {
      expect(
        screen.queryByTestId("device-installed-path") ??
          screen.queryByTestId("device-error"),
      ).not.toBeNull();
    });
  }

  const posts = (): unknown[][] =>
    fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );

  it("offers the wrapper install, and posts only to the wrapper route", async () => {
    await renderDev();

    expect(screen.getByTestId("device-install").textContent).toBe(
      "Install the plug-in wrapper devices",
    );
    expect(
      (screen.getByTestId("device-install") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.getByTestId("device-status").textContent).toBe(
      "Development build: freeze it to copy.",
    );

    await clickInstall(
      jsonResponse({
        detail: "Plug-in wrapper devices: PPal Plug-in Effect installed.",
        pluginHost: [{ name: "PPal Plug-in Effect", status: "installed" }],
      }),
      jsonResponse(deviceStatusBody({ ...DEV, pluginHost: CURRENT })),
    );

    const [[url, init]] = posts() as [[string, RequestInit]];

    expect(url).toContain("/device-install/plugin-host");
    expect(JSON.parse(init.body as string)).toStrictEqual({
      userLibrary: deviceStatusBody().userLibrary,
    });

    const done = screen.getByTestId("device-installed-path");

    expect(done.textContent).toBe(
      "Plug-in wrapper devices: PPal Plug-in Effect installed.",
    );
    expect(done.className).not.toContain("amber");
    // The status is read again, and the button goes back to a disabled Copy.
    await waitForHookState(() => {
      expect(screen.getByTestId("device-install").textContent).toBe("Copy");
    });
    expect(
      (screen.getByTestId("device-install") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("flags a wrapper that failed to install", async () => {
    await renderDev();
    await clickInstall(
      jsonResponse({
        detail:
          "Plug-in wrapper devices: PPal Plug-in Effect failed: close any Set that uses it, or quit Live, then click Install.",
        pluginHost: [{ name: "PPal Plug-in Effect", ok: false, path: "/p" }],
      }),
    );

    const done = screen.getByTestId("device-installed-path");

    expect(done.className).toContain("amber");
    expect(done.textContent).toContain("then click Install.");
    expect(screen.getByTestId("device-install").textContent).toBe(
      "Install the plug-in wrapper devices",
    );
  });

  it("shows the server's reason for a refusal", async () => {
    await renderDev();
    await clickInstall(
      new Response(JSON.stringify({ error: "Not a folder: /nope" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(screen.getByTestId("device-error").textContent).toBe(
      "Not a folder: /nope",
    );
    expect(screen.queryByTestId("device-installed-path")).toBeNull();
  });

  it("shows an error for a network failure", async () => {
    await renderDev();
    await clickInstall(new Error("Failed to fetch"));

    expect(screen.getByTestId("device-error").textContent).toBe(
      "Failed to fetch",
    );
  });

  it("shows an error for a 200 that doesn't say what it did", async () => {
    await renderDev();
    await clickInstall(jsonResponse({ detail: "Done." }));

    expect(screen.getByTestId("device-error").textContent).toBe(
      "Install failed: the server didn't say what it did",
    );
    expect(screen.queryByTestId("device-installed-path")).toBeNull();
  });

  it("shows an error for a non-JSON failure", async () => {
    await renderDev();
    await clickInstall(new Response("Not found", { status: 404 }));

    expect(screen.getByTestId("device-error").textContent).toBe(
      "Install failed (404)",
    );
  });
});
