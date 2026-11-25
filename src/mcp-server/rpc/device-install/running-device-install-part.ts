// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { installPartOfDevice } from "#src/portal/setup/device-install-part.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { type InstallPart } from "#src/tools/core/helpers/manage-contract.ts";
import { installRunningDevice } from "./device-install.ts";

/**
 * Copy the running device into the User Library, as ppal-manage reports it.
 * Version-aware like the chat UI's install, without `force`: an installed
 * device that is newer, or can't be ordered, stays.
 * @param library - Absolute path to the User Library
 * @returns What became of the device file; never throws
 */
export function installRunningDevicePart(library: string): InstallPart {
  try {
    const install = installRunningDevice(library);

    const { result } = install;

    // A refusal or failure that did a copy says what it did.
    return result == null
      ? { ok: false, detail: (install as { error: string }).error }
      : installPartOfDevice(result, "device");
  } catch (error) {
    return {
      ok: false,
      detail: `Couldn't install the device: ${errorMessage(error)}`,
    };
  }
}
