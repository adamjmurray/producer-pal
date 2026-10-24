// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  deviceFilePath,
  readDeviceVersion,
} from "#src/portal/setup/device-file-status.ts";
import { VERSION } from "#src/shared/config.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { outdatedScript } from "../remote-script/port/remote-script-version.ts";
import { type RemoteScriptPing } from "../remote-script/remote-script-client.ts";
import {
  libraryPathExists,
  readLibraryBytes,
} from "../remote-script/user-library/user-library-fs.ts";
import { type DeviceInstallStatus } from "./device-install-status.ts";

/** Whether the running device can be swapped for the User Library copy. */
export type SwapCheck =
  | {
      allowed: true;
      /** The User Library copy the swap loads */
      copy: string;
      reason: null;
    }
  | {
      allowed: false;
      /** Why not, in plain words */
      reason: string;
    };

/**
 * Check the running device can be swapped for the User Library copy: it isn't
 * that copy already, the copy is there and isn't older, and the remote script
 * that does the swap is running. The server checks this again before a swap
 * and never trusts the chat UI to have.
 *
 * @param status - The device's install status, for the User Library to use
 * @param ping - Asks the remote script whether it is running
 * @returns The copy to load, or why the swap isn't offered
 */
export async function deviceSwapCheck(
  status: DeviceInstallStatus,
  ping: () => Promise<RemoteScriptPing>,
): Promise<SwapCheck> {
  const { userLibrary } = status;

  if (status.source == null) {
    return refuse("This device hasn't said where its file is yet.");
  }

  if (userLibrary == null) {
    return refuse("No User Library was found. Enter its path above.");
  }

  if (status.inUserLibrary) {
    return refuse("This device is already the copy in your User Library.");
  }

  const copy = deviceFilePath(userLibrary);
  const tooOld = copyProblem(copy);

  if (tooOld != null) {
    return refuse(tooOld);
  }

  const script = await ping();

  if (!script.running) {
    return refuse(
      "The remote script isn't running, and it does the swap. Install and enable it above first.",
    );
  }

  // Worded for the person in the Installation tab, not the model.
  return outdatedScript(script.scriptVersion) == null
    ? { allowed: true, copy, reason: null }
    : refuse(
        "The remote script is too old to do the swap. Update it above, then restart Live.",
      );
}

/**
 * @param reason - Why the swap isn't offered
 * @returns A refusal
 */
function refuse(reason: string): SwapCheck {
  return { allowed: false, reason };
}

/**
 * Judge the copy in the User Library. A copy that is older than this device
 * would downgrade the Set, so it has to be updated first.
 *
 * @param copy - Where the copy would be
 * @returns What is wrong with it, or null when it can be swapped in
 */
function copyProblem(copy: string): string | null {
  if (!libraryPathExists(copy)) {
    return "There is no copy of this device in your User Library yet. Install it first.";
  }

  let version: string | undefined;

  try {
    version = readDeviceVersion(readLibraryBytes(copy));
  } catch {
    return "The copy in your User Library can't be read.";
  }

  if (version == null) {
    return "The copy in your User Library names no version, so it can't be compared with this device. Update it first.";
  }

  return isNewerVersion(version, VERSION)
    ? `The copy in your User Library (v${version}) is older than this device (v${VERSION}). Update it first.`
    : null;
}
