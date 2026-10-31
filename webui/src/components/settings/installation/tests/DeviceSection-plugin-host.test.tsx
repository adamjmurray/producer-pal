// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  afterEach(() => {
    vi.unstubAllEnvs();
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

    expect(installLabel()).toBe("Install the plug-in host devices");
    expect(screen.getByTestId("device-plugin-host").textContent).toBe(
      "Plug-in host devices: PPal Plug-in Effect is not installed; PPal Plug-in Instrument is installed",
    );
  });

  it("offers it for a wrapper that differs from this build's", async () => {
    await renderDevice({
      pluginHost: [{ ...MISSING[0], state: "differs" }, MISSING[1]],
    });

    expect(installLabel()).toBe("Install the plug-in host devices");
    expect(screen.getByTestId("device-plugin-host").textContent).toContain(
      "PPal Plug-in Effect differs from this build",
    );
  });

  it("offers nothing when the device and the wrappers are current", async () => {
    await renderDevice({ pluginHost: [...CURRENT] });

    expect(installLabel()).toBeNull();
    expect(screen.getByTestId("device-plugin-host").textContent).toBe(
      "Plug-in host devices: installed",
    );
  });

  it("keeps the device's own label when the device needs installing too", async () => {
    await renderDevice({ state: "not-installed", pluginHost: [...MISSING] });

    expect(installLabel()).toBe("Copy");
  });

  it("says nothing about them when the server reports none", async () => {
    await renderDevice();

    expect(installLabel()).toBeNull();
    expect(screen.queryByTestId("device-plugin-host")).toBeNull();
  });

  it("shows what the install did to each wrapper, then drops the button", async () => {
    await renderDevice({ pluginHost: [...MISSING] });

    const detail =
      "The installed device is already this one. Plug-in host wrappers: PPal Plug-in Effect installed; PPal Plug-in Instrument already installed.";

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
          "Plug-in host wrappers: PPal Plug-in Effect failed: close any Set that uses it, or quit Live, then click Install.",
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

  it("shows nothing about them in a build that doesn't host plug-ins", async () => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "");
    await renderDevice({ pluginHost: [...MISSING] });

    expect(installLabel()).toBeNull();
    expect(screen.queryByTestId("device-plugin-host")).toBeNull();
  });

  it("doesn't flag a failed wrapper in a build that doesn't host plug-ins", async () => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "");
    await renderDevice({ state: "not-installed" });
    routes.device(
      jsonResponse({
        outcome: "installed",
        path: DEVICE_PATH,
        detail: "Installed.",
        pluginHost: [{ name: "PPal Plug-in Effect", ok: false, path: "/p" }],
      }),
      jsonResponse(deviceStatusBody({ state: "same" })),
    );
    fireEvent.click(screen.getByTestId("device-install"));

    const done = await waitForHookState(() =>
      screen.getByTestId("device-installed-path"),
    );

    expect(done.className).not.toContain("amber");
  });
});
