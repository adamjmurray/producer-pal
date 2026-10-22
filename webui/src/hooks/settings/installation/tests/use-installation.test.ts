// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { useInstallation } from "#webui/hooks/settings/installation/use-installation";
import { type DeviceInstallStatus } from "#webui/hooks/settings/installation/use-device-install";
import { type RemoteScriptStatus } from "#webui/hooks/settings/installation/use-remote-script";
import {
  deviceStatusBody,
  routeInstallationFetch,
} from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";
import { statusBody } from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";

const CURRENT_DEVICE: Partial<DeviceInstallStatus> = {
  state: "same",
  installedVersion: "1.2.0",
};
const CURRENT_SCRIPT: Partial<RemoteScriptStatus> = {
  installed: true,
  installedVersion: "1.2.0",
};

describe("useInstallation", () => {
  const fetchMock = installFetchMock();
  let routes: ReturnType<typeof routeInstallationFetch>;

  beforeEach(() => {
    routes = routeInstallationFetch(fetchMock);
  });

  /**
   * Render the hook past both mount reads.
   * @param device - Device status fields to change
   * @param remote - Remote script status fields to change
   * @returns The rendered hook
   */
  async function renderInstallation(
    device: Partial<DeviceInstallStatus>,
    remote: Partial<RemoteScriptStatus>,
  ): Promise<
    ReturnType<typeof renderHook<ReturnType<typeof useInstallation>, unknown>>
  > {
    routes.device(jsonResponse(deviceStatusBody(device)));
    routes.remote(jsonResponse(statusBody(remote)));

    const rendered = renderHook(() => useInstallation());

    await waitForHookState(() => {
      expect(rendered.result.current.device.status).not.toBeNull();
      expect(rendered.result.current.remote.status).not.toBeNull();
    });

    return rendered;
  }

  it("reads each status once, and shares the state it returns", async () => {
    const { result } = await renderInstallation(CURRENT_DEVICE, CURRENT_SCRIPT);

    const reads = (path: string) =>
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));

    expect(reads("/device-install")).toHaveLength(1);
    expect(reads("/remote-script")).toHaveLength(1);
    expect(result.current.swap.phase).toBe("idle");
  });

  it("is not incomplete before either status is read", () => {
    routes.device(new Promise(() => {}));
    routes.remote(new Promise(() => {}));

    const { result } = renderHook(() => useInstallation());

    expect(result.current.incomplete).toBe(false);
  });

  it("is complete when the copy and the remote script are current", async () => {
    const { result } = await renderInstallation(CURRENT_DEVICE, CURRENT_SCRIPT);

    expect(result.current.incomplete).toBe(false);
  });

  it.each(["not-installed", "installed-older"] as const)(
    "is incomplete when the User Library copy is %s",
    async (state) => {
      const { result } = await renderInstallation(
        { state, installedVersion: null },
        CURRENT_SCRIPT,
      );

      expect(result.current.incomplete).toBe(true);
    },
  );

  it("leaves a newer or different copy to the user", async () => {
    const { result } = await renderInstallation(
      { state: "installed-newer", installedVersion: "9.0.0" },
      CURRENT_SCRIPT,
    );

    expect(result.current.incomplete).toBe(false);
  });

  it("does not count the copy of a device that can't be copied", async () => {
    const { result } = await renderInstallation(
      { problem: "not-frozen", state: null, path: null },
      CURRENT_SCRIPT,
    );

    expect(result.current.incomplete).toBe(false);
  });

  it("is incomplete when the remote script is missing or behind", async () => {
    const missing = await renderInstallation(CURRENT_DEVICE, {});

    expect(missing.result.current.incomplete).toBe(true);

    const behind = await renderInstallation(CURRENT_DEVICE, {
      ...CURRENT_SCRIPT,
      updateAvailable: true,
    });

    expect(behind.result.current.incomplete).toBe(true);
  });

  it("has nothing to compare for the remote script without a User Library", async () => {
    const { result } = await renderInstallation(CURRENT_DEVICE, {
      userLibrary: null,
    });

    expect(result.current.incomplete).toBe(false);
  });
});
