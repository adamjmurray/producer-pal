// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-manage update-producer-pal: replace the running Producer Pal device with
// the one this portal ships, in place. The portal answers it, online or not,
// because the device being replaced can't: its server dies with the swap.
// Every refusal before the swap says nothing changed; every failure after
// Live may have acted says what to check.

import { UPDATE_PORTAL_ADVICE, VERSION } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  formatSuccessResponse,
  type McpResponse,
} from "#src/shared/mcp-responses.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { offlineGuidance } from "../offline/offline-guidance.ts";
import { offlineError, offlineResult } from "../offline/offline-responses.ts";
import {
  installBundledDevice,
  requireBundledDevice,
} from "../setup/bundled-device-copy.ts";
import { type DeviceInstallResult } from "../setup/device-install.ts";
import { userLibraryFor } from "../setup/library-for-device.ts";
import { remoteScriptReady } from "../setup/remote-script-ready.ts";
import { SetupFailed, type SetupPurpose } from "../setup/setup-failure.ts";
import { waitForNewDevice } from "./new-device-wait.ts";
import { replaceDevice } from "./replace-device-request.ts";
import { type RunningDevice } from "./running-device.ts";

const UPDATE: SetupPurpose = {
  action: "update-producer-pal",
  doing: "updating the device",
  unchanged: "nothing was changed",
};

/** The device file the remote script is asked to load. */
interface DeviceFile {
  path: string;
  /** The version it names, when it names one */
  version?: string;
  /** Said in the result when the file isn't the one this portal ships */
  note?: string;
}

/**
 * Update the running Producer Pal device to the one this portal ships.
 * @param userLibrary - The User Library the call gave, if any
 * @param device - The bridge's connection to the running device
 * @param deps - What the steps reach out to
 * @returns The versions and the track, or why nothing (or not everything) happened
 */
export async function updateProducerPal(
  userLibrary: string | undefined,
  device: RunningDevice,
  deps: OfflineDeps,
): Promise<McpResponse> {
  // A fresh handshake: the cached connection may predate a manual update.
  device.reset();

  try {
    await device.connect();
  } catch {
    return await offlineGuidance(true, deps);
  }

  try {
    const running = device.version();
    const from = versionToReplace(running);

    if (from == null) {
      return formatSuccessResponse(
        `Producer Pal is already ${String(running)}, the version this connector ships. Nothing to update.`,
      );
    }

    const bundled = requireBundledDevice(deps, UPDATE);
    const ping = await remoteScriptReady(deps, UPDATE);
    const library = await userLibraryFor(userLibrary, ping, deps, UPDATE);
    const file = deviceFile(
      installBundledDevice(library, bundled, deps, UPDATE),
      from,
    );
    const track = await replaceDevice(file.path, from, deps);
    const to = await waitForNewDevice(
      { from, expected: file.version, track },
      device,
      deps,
    );

    device.toolsChanged();

    return offlineResult({
      device: { from, to },
      ...(track == null ? {} : { track }),
      ...(file.note == null ? {} : { note: file.note }),
      nextSteps: "Call ppal-connect next.",
    });
  } catch (error) {
    return offlineError(errorMessage(error));
  }
}

/**
 * @param running - The version the running device reports
 * @returns The version, when it is older than this portal's; null when it is
 *   the same
 * @throws SetupFailed when there is nothing to update to
 */
function versionToReplace(running: string | undefined): string | null {
  if (running == null) {
    throw new SetupFailed(
      "couldn't tell which version of Producer Pal is running, so nothing was changed. Tell the user to update the Producer Pal device by hand.",
    );
  }

  if (isNewerVersion(VERSION, running)) {
    throw new SetupFailed(
      `the running Producer Pal (${running}) is newer than this portal (${VERSION}), so there is nothing to update to. Nothing was changed. ${UPDATE_PORTAL_ADVICE}`,
    );
  }

  return isNewerVersion(running, VERSION) ? running : null;
}

/**
 * Swapping a device for one that isn't newer would only restart it, so the
 * file has to name a version newer than the running one.
 * @param shipped - The version the file this portal ships names, if it does
 * @param running - The version of the device being replaced
 * @returns The shipped version
 * @throws SetupFailed when it can't be confirmed as newer
 */
function shippedVersionToLoad(
  shipped: string | undefined,
  running: string,
): string {
  if (shipped == null) {
    throw new SetupFailed(
      `the device this portal ships names no version, so it can't be confirmed as newer than the running one (${running}). Nothing in the Live Set was changed.`,
    );
  }

  if (!isNewerVersion(running, shipped)) {
    throw new SetupFailed(
      `the device this portal ships (${shipped}) isn't newer than the running one (${running}), so there is nothing to update to. Nothing in the Live Set was changed.`,
    );
  }

  return shipped;
}

/**
 * Judge the copy of the bundled device into the User Library.
 * @param result - What the copy did
 * @param running - The version of the device being replaced
 * @returns The file to load
 * @throws SetupFailed when the file can't be used to update
 */
function deviceFile(result: DeviceInstallResult, running: string): DeviceFile {
  const { path, previousVersion, bundledVersion } = result;

  if (result.outcome === "failed") {
    throw new SetupFailed(
      `couldn't copy the new device into the User Library (${result.error}). The file may be in use by Live. Nothing in the Live Set was changed.`,
    );
  }

  if (result.outcome !== "skipped") {
    return { path, version: shippedVersionToLoad(bundledVersion, running) };
  }

  // The copy left a different file alone: it is only worth loading if it is
  // newer than the device that is running.
  if (previousVersion == null || !isNewerVersion(running, previousVersion)) {
    throw new SetupFailed(
      `the device in the User Library (${previousVersion ?? "unknown version"}) isn't the one this portal ships and isn't newer than the running one (${running}), so it was left alone. Nothing was changed.`,
    );
  }

  return {
    path,
    version: previousVersion,
    note: `loaded the device already in the User Library (${previousVersion}), which is newer than this portal's (${bundledVersion ?? VERSION}). ${UPDATE_PORTAL_ADVICE}`,
  };
}
