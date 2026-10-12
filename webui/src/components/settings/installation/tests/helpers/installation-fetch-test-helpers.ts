// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Mock, type vi } from "vitest";
import { jsonResponse } from "#webui/hooks/context/tests/doc-transport-test-helpers";
import { type DeviceInstallStatus } from "#webui/hooks/settings/installation/use-device-install";
import { statusBody, USER_LIBRARY } from "./remote-script-status-test-helpers";

export const DEVICE_PATH = `${USER_LIBRARY}/Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd`;

/**
 * A `GET /device-install` body: a frozen device, not yet in the User Library.
 * @param overrides - Fields to change
 * @returns The status body
 */
export function deviceStatusBody(
  overrides: Partial<DeviceInstallStatus> = {},
): DeviceInstallStatus {
  return {
    source: "/Users/me/Downloads/Producer_Pal.amxd",
    problem: null,
    userLibrary: USER_LIBRARY,
    path: DEVICE_PATH,
    state: "not-installed",
    version: "1.2.0",
    installedVersion: null,
    otherCopies: [],
    ...overrides,
  };
}

/** What the stubbed `fetch` looks like to this helper. */
export type FetchStub = (url: string) => Promise<Response>;

/** One queued answer: a response, a failure, or a promise of either. */
type Answer = Response | Error | Promise<Response>;

/** Queue the answers the Installation tab's two endpoints give next. */
export interface InstallationRoutes {
  /** `/remote-script` and `/remote-script/install`, in order */
  remote: (...answers: Answer[]) => void;
  /** `/device-install` and `/device-install/install`, in order */
  device: (...answers: Answer[]) => void;
}

/**
 * Route a fetch mock by endpoint, so the tab's two status reads can't swap
 * answers. An endpoint with nothing queued answers with its default status.
 * @param fetchMock - The installed fetch mock
 * @returns Queues for each endpoint
 */
export function routeInstallationFetch(
  fetchMock: ReturnType<typeof vi.fn>,
): InstallationRoutes {
  const remote: Answer[] = [];
  const device: Answer[] = [];

  // The shared mock is untyped, so its implementations would read as void.
  (fetchMock as unknown as Mock<FetchStub>).mockImplementation((url) => {
    const isDevice = url.includes("/device-install");
    const next = (isDevice ? device : remote).shift();

    if (next instanceof Error) {
      return Promise.reject(next);
    }

    return Promise.resolve(
      next ?? jsonResponse(isDevice ? deviceStatusBody() : statusBody()),
    );
  });

  return {
    remote: (...answers) => remote.push(...answers),
    device: (...answers) => device.push(...answers),
  };
}
