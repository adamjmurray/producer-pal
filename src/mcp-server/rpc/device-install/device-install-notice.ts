// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { errorMessage } from "#src/shared/error-message.ts";
import { readGlobalSettings } from "../../helpers/config-store/global-settings-store.ts";
import { getUpdate } from "../../helpers/http/update-check.ts";
import * as console from "../../node-for-max-logger.ts";
import { deviceInstallStatus } from "./device-install-status.ts";
import { installIncomplete } from "./install-incomplete.ts";

/**
 * Show or hide the device's "Finish installation" notice. It shows when the
 * installation is incomplete, the user hasn't turned the warning off, and no
 * update notice is showing in its place (same spot on the device). Never
 * throws: a state that can't be read leaves the notice as it is.
 */
export async function syncDeviceInstallNotice(): Promise<void> {
  try {
    const show =
      readGlobalSettings().warnIfInstallIncomplete &&
      installIncomplete(await deviceInstallStatus()) &&
      // The update notice decides itself (setting, dismissal): ask it.
      (await getUpdate()) == null;

    // Rides the "config" outlet like `updateDismissed`; the patch's route
    // needs the same "name value" shape as the other settings.
    void Max.outlet("config", "installNotice", show ? 1 : 0);
  } catch (error) {
    console.warn(
      `Could not check the device installation: ${errorMessage(error)}`,
    );
  }
}
