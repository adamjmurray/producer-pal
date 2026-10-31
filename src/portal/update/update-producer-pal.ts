// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-manage update-producer-pal: replace the running Producer Pal device with
// the one this portal ships, in place. The portal answers it, online or not,
// because the device being replaced can't: its server dies with the swap.
// A refusal before the swap says what it left alone (the Live Set, and the User
// Library when the file was written); every failure after Live may have acted
// says what to check.

import { UPDATE_PORTAL_ADVICE, VERSION } from "#src/shared/config.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  formatSuccessResponse,
  type McpResponse,
} from "#src/shared/mcp-responses.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { offlineGuidance } from "../offline/offline-guidance.ts";
import { offlineError, offlineResult } from "../offline/offline-responses.ts";
import {
  installBundledDevice,
  requireBundledDevice,
} from "../setup/bundled-device/bundled-device-copy.ts";
import { type DeviceInstallResult } from "../setup/device-install.ts";
import { userLibraryFor } from "../setup/library-for-device.ts";
import { remoteScriptReady } from "../setup/remote-script-ready.ts";
import { setupDeadline } from "../setup/setup-deadline.ts";
import { SetupFailed, type SetupPurpose } from "../setup/setup-failure.ts";
import { waitForNewDevice } from "./new-device-wait.ts";
import { setUnchanged } from "./set-unchanged.ts";
import { replaceDevice } from "./replace-device-request.ts";
import { type RunningDevice } from "./running-device.ts";
import { updatedNextSteps } from "./full-connect-advice.ts";

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
  /** Whether this update wrote the file into the User Library */
  written: boolean;
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
  const deadline = setupDeadline(deps);

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
    const pluginHost = deps.installPluginHost(library);
    const track = await replaceDevice(
      file.path,
      from,
      deps,
      file.written,
      deadline,
      device.fullConnectSeen(),
    );
    const to = await waitForNewDevice(
      { from, expected: file.version, track },
      device,
      deps,
      deadline,
    );

    device.toolsChanged();

    return offlineResult({
      device: { from, to },
      ...(track == null ? {} : { track }),
      ...(file.note == null ? {} : { note: file.note }),
      ...(pluginHost.length === 0 ? {} : { pluginHost }),
      nextSteps: updatedNextSteps(device.fullConnectSeen()),
    });
  } catch (error) {
    return offlineError(errorMessage(error));
  }
}

/**
 * @param running - The version the running device reports
 * @returns The version, when it is older than this portal's; null when it is
 *   the same
 * @throws SetupFailed when there is nothing to update to, or its order against
 *   this portal's can't be told
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

  if (isNewerVersion(running, VERSION)) {
    return running;
  }

  if (running !== VERSION) {
    throw new SetupFailed(
      `couldn't tell whether the running Producer Pal (${running}) is older than this portal (${VERSION}), so nothing was changed. Tell the user to update the Producer Pal device by hand.`,
    );
  }

  return null;
}

/**
 * Swapping a device for one that isn't newer would only restart it, so the
 * file has to name a version newer than the running one.
 * @param shipped - The version the file this portal ships names, if it does
 * @param running - The version of the device being replaced
 * @param written - Whether the file was just written to the User Library
 * @returns The shipped version
 * @throws SetupFailed when it can't be confirmed as newer
 */
function shippedVersionToLoad(
  shipped: string | undefined,
  running: string,
  written: boolean,
): string {
  if (shipped == null) {
    throw new SetupFailed(
      `the device this portal ships names no version, so it can't be confirmed as newer than the running one (${running}). ${setUnchanged(written)}`,
    );
  }

  if (!isNewerVersion(running, shipped)) {
    throw new SetupFailed(
      `the device this portal ships (${shipped}) isn't newer than the running one (${running}), so there is nothing to update to. ${setUnchanged(written)}`,
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
      `couldn't copy the new device into the User Library (${result.error}). The file may be in use by Live. ${setUnchanged(false)}`,
    );
  }

  if (result.outcome !== "skipped") {
    return {
      path,
      version: shippedVersionToLoad(bundledVersion, running, result.changed),
      written: result.changed,
    };
  }

  // The copy left a different file alone: it is only worth loading if it is
  // newer than the device that is running.
  if (previousVersion == null || !isNewerVersion(running, previousVersion)) {
    throw new SetupFailed(
      `the device in the User Library (${previousVersion ?? "unknown version"}) isn't the one this portal ships and isn't newer than the running one (${running}), so it was left alone. Nothing was changed.`,
    );
  }

  const shipped = bundledVersion ?? VERSION;

  return {
    path,
    version: previousVersion,
    written: false,
    // A skipped copy is newer than the portal's, or can't be ordered against it.
    note: isNewerVersion(shipped, previousVersion)
      ? `loaded the device already in the User Library (${previousVersion}), which is newer than this portal's (${shipped}). ${UPDATE_PORTAL_ADVICE}`
      : previousVersion === shipped
        ? `loaded the device already in the User Library as it is: another build of this portal's version (${shipped}).`
        : `loaded the device already in the User Library (${previousVersion}) as it is. It differs from this portal's (${shipped}), and which is newer can't be told.`,
  };
}
