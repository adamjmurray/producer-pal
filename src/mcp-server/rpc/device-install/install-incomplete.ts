// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isInstallIncomplete } from "#src/shared/version-check.ts";
import { remoteScriptCurrent } from "../remote-script/remote-script-status.ts";
import { type DeviceInstallStatus } from "./device-install-status.ts";

/**
 * Whether the installation is unfinished. See `isInstallIncomplete`, which
 * holds the one definition the device's notice goes by.
 *
 * @param device - The device's install status
 * @returns Whether something in the User Library is missing or out of date
 */
export function installIncomplete(device: DeviceInstallStatus): boolean {
  return isInstallIncomplete({
    problem: device.problem,
    state: device.state,
    remoteScriptCurrent:
      device.userLibrary == null
        ? null
        : remoteScriptCurrent(device.userLibrary),
  });
}
