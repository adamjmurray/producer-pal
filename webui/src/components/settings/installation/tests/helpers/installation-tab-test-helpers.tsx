// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { render, screen } from "@testing-library/preact";
import { beforeEach, expect, type vi } from "vitest";
import {
  installFetchMock,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { InstallationTabHarness } from "#webui/components/settings/installation/tests/helpers/InstallationTabHarness";
import { type DeviceInstallStatus } from "#webui/hooks/settings/installation/use-device-install";
import { type RemoteScriptStatus } from "#webui/hooks/settings/installation/use-remote-script";
import {
  deviceStatusBody,
  type InstallationRoutes,
  routeInstallationFetch,
} from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";
import { statusBody } from "#webui/components/settings/installation/tests/helpers/remote-script-status-test-helpers";

/**
 * Install the fetch mock and route it by endpoint before each test. Call it
 * in a `describe` body.
 * @returns The fetch mock, and routes that queue on the current test's mock
 */
export function setupInstallationTab(): {
  fetchMock: ReturnType<typeof vi.fn>;
  routes: InstallationRoutes;
} {
  const fetchMock = installFetchMock();
  let current: InstallationRoutes;

  beforeEach(() => {
    current = routeInstallationFetch(fetchMock);
  });

  return {
    fetchMock,
    routes: {
      remote: (...answers) => current.remote(...answers),
      device: (...answers) => current.device(...answers),
    },
  };
}

/**
 * Render the tab past the device's mount read.
 * @param routes - The tab's fetch routes
 * @param overrides - Device status fields to change
 */
export async function renderDeviceTab(
  routes: InstallationRoutes,
  overrides: Partial<DeviceInstallStatus> = {},
): Promise<void> {
  routes.device(jsonResponse(deviceStatusBody(overrides)));
  render(<InstallationTabHarness />);
  await waitForHookState(() => {
    expect(screen.queryByTestId("device-loading")).toBeNull();
  });
}

/**
 * Render the tab past the remote script's mount read.
 * @param routes - The tab's fetch routes
 * @param overrides - Remote script status fields to change
 * @returns The remote script status line
 */
export async function renderRemoteScriptTab(
  routes: InstallationRoutes,
  overrides: Partial<RemoteScriptStatus> = {},
): Promise<HTMLElement> {
  routes.remote(jsonResponse(statusBody(overrides)));
  render(<InstallationTabHarness />);

  return await waitForHookState(() =>
    screen.getByTestId("remote-script-status"),
  );
}
