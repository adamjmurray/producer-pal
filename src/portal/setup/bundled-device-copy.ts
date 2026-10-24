// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { ASK_FOR_LIBRARY } from "#src/mcp-server/rpc/remote-script/install/remote-script-install-reply.ts";
import { UserLibraryFolderError } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { SETUP_URL } from "../offline/offline-setup-hints.ts";
import { type DeviceInstallResult } from "./device-install.ts";
import { type SetupPurpose, SetupFailed, sentence } from "./setup-failure.ts";

/**
 * @param deps - The bundled device lookup
 * @param purpose - What the call is for
 * @returns Absolute path of the device file that shipped with this portal
 * @throws SetupFailed when none shipped
 */
export function requireBundledDevice(
  deps: Pick<OfflineDeps, "findBundledDevice">,
  purpose: SetupPurpose,
): string {
  const bundled = deps.findBundledDevice();

  if (bundled == null) {
    throw new SetupFailed(
      `this Producer Pal install has no bundled device, so ${purpose.unchanged}. Tell the user to install it by hand: ${SETUP_URL}`,
    );
  }

  return bundled;
}

/**
 * Put the bundled device in the User Library. A copy that ran and failed comes
 * back as a result for the caller to judge; one that never started throws.
 * @param library - Absolute path to the User Library
 * @param bundled - The device file that shipped with the portal
 * @param deps - The copy
 * @param purpose - What the call is for
 * @returns What happened to the device file
 * @throws SetupFailed when the library isn't a folder or the bundled file can't be read
 */
export function installBundledDevice(
  library: string,
  bundled: string,
  deps: Pick<OfflineDeps, "installDevice">,
  purpose: SetupPurpose,
): DeviceInstallResult {
  try {
    return deps.installDevice(library, bundled);
  } catch (error) {
    const message = errorMessage(error);

    throw new SetupFailed(
      error instanceof UserLibraryFolderError
        ? `${message}; ${purpose.unchanged}. ${ASK_FOR_LIBRARY}`
        : `${message}. ${sentence(purpose.unchanged)}.`,
      { cause: error },
    );
  }
}
