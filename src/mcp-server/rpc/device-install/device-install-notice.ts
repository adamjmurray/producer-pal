// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { VERSION } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  readGlobalSettings,
  updateGlobalSettings,
} from "../../helpers/config-store/global-settings-store.ts";
import * as console from "../../node-for-max-logger.ts";
import {
  type DeviceInstallStatus,
  deviceInstallStatus,
} from "./device-install-status.ts";

/**
 * Whether the device should offer to finish its installation: it can be
 * copied, and the User Library has no copy or an older one. A newer or
 * different copy is the user's call, so it isn't nagged about.
 *
 * @param status - The device's install status
 * @param dismissedVersion - The version whose notice the user dismissed, or null
 * @returns Whether the notice should show
 */
export function shouldShowInstallNotice(
  status: DeviceInstallStatus,
  dismissedVersion: string | null,
): boolean {
  return (
    status.problem == null &&
    (status.state === "not-installed" || status.state === "installed-older") &&
    dismissedVersion !== status.version
  );
}

/**
 * Show or hide the device's "Finish installation" notice to match the install
 * state and the saved dismissal. Never throws: a state that can't be read
 * leaves the notice as it is.
 */
export async function syncDeviceInstallNotice(): Promise<void> {
  try {
    const status = await deviceInstallStatus();
    const show = shouldShowInstallNotice(
      status,
      readGlobalSettings().dismissedInstallVersion,
    );

    // Rides the "config" outlet like `updateDismissed`; the patch's route
    // needs the same "name value" shape as the other settings.
    void Max.outlet("config", "installNotice", show ? 1 : 0);
  } catch (error) {
    console.warn(
      `Could not check the device installation: ${errorMessage(error)}`,
    );
  }
}

/**
 * Dismiss the installation notice from the device's × button: save this
 * version to the global settings, then hide the notice. If the save fails the
 * notice stays up and a warning goes to the Max console, so the device never
 * claims a dismissal that won't survive the next load.
 */
export async function dismissInstallNotice(): Promise<void> {
  try {
    updateGlobalSettings({ dismissedInstallVersion: VERSION });
  } catch (error) {
    console.warn(
      `Could not save the installation dismissal: ${errorMessage(error)}`,
    );

    return;
  }

  await syncDeviceInstallNotice();
}
