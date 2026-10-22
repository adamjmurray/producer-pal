// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isInstallIncomplete } from "#src/shared/version-check";
import {
  useDeviceInstall,
  type UseDeviceInstallReturn,
} from "./use-device-install";
import { useDeviceSwap, type UseDeviceSwapReturn } from "./use-device-swap";
import {
  useRemoteScript,
  type RemoteScriptStatus,
  type UseRemoteScriptReturn,
} from "./use-remote-script";

export interface UseInstallationReturn {
  remote: UseRemoteScriptReturn;
  device: UseDeviceInstallReturn;
  swap: UseDeviceSwapReturn;
  /** Whether the device or its remote script is missing or out of date. */
  incomplete: boolean;
}

/**
 * The state behind the Installation tab, owned by the settings screen so the
 * tab button's attention dot and the tab itself read the server once.
 * @returns The remote script and device state, and whether the install is incomplete
 */
export function useInstallation(): UseInstallationReturn {
  const remote = useRemoteScript();
  const device = useDeviceInstall();
  const swap = useDeviceSwap(device.refresh);
  const incomplete = isInstallIncomplete({
    problem: device.status?.problem ?? null,
    state: device.status?.state ?? null,
    remoteScriptCurrent: remoteScriptCurrent(remote.status),
  });

  return { remote, device, swap, incomplete };
}

/**
 * @param status - The remote script status, or null before it is read
 * @returns Whether the script is in place and not behind this build; null with
 *   no User Library to look in, or no reading yet
 */
function remoteScriptCurrent(
  status: RemoteScriptStatus | null,
): boolean | null {
  if (status?.userLibrary == null) {
    return null;
  }

  return status.installed && !status.updateAvailable;
}
