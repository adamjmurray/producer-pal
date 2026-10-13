// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { remoteScriptCurrent } from "../remote-script/remote-script-status.ts";
import { type DeviceInstallStatus } from "./device-install-status.ts";

/**
 * Whether the installation is unfinished: the User Library has no copy of this
 * device or an older one (only a frozen device can be copied; a newer or
 * different copy is the user's call), or its remote script is missing or behind
 * this build. The one definition the device's notice goes by.
 *
 * @param device - The device's install status
 * @returns Whether something in the User Library is missing or out of date
 */
export function installIncomplete(device: DeviceInstallStatus): boolean {
  const copyBehind =
    device.problem == null &&
    (device.state === "not-installed" || device.state === "installed-older");

  // With no User Library there is nothing to compare, so nothing to nag about.
  return (
    copyBehind ||
    (device.userLibrary != null && !remoteScriptCurrent(device.userLibrary))
  );
}
