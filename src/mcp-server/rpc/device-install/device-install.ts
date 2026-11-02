// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type DeviceInstallResult,
  installDevice,
} from "#src/portal/setup/device-install.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { resolveUserLibraryFolder } from "../remote-script/user-library/user-library-folder.ts";
import {
  type DeviceInstallProblem,
  checkDeviceSource,
} from "./device-install-status.ts";
import { syncDeviceInstallNotice } from "./device-install-notice.ts";

/**
 * - `done`: it's in the User Library now (`installed`, `updated` or `current`).
 *   `library` is the User Library folder it went into, resolved.
 * - `refused`: nothing was tried. The running device can't be copied, or the
 *   copy there is newer or can't be told apart and `force` wasn't set.
 * - `failed`: tried and couldn't. `result` says what changed anyway.
 */
export type RunningDeviceInstall =
  | { status: "done"; result: DeviceInstallResult; library: string }
  | { status: "refused"; error: string; result?: DeviceInstallResult }
  | { status: "failed"; error: string; result?: DeviceInstallResult };

const PROBLEM_TEXT: Record<
  Exclude<DeviceInstallProblem, "no-user-library">,
  string
> = {
  "unknown-source":
    "This device hasn't said where its file is yet. Try again in a moment.",
  "unreadable-source": "This device's file can't be read.",
  "not-frozen":
    "This is a development device, which needs the files beside it. Freeze it first.",
};

/**
 * Copy the running device into the User Library. A copy that's newer, or that
 * can't be told apart by version, is replaced only with `force`. A failure
 * after the filesystem changed still returns: the result says what changed.
 *
 * @param userLibrary - Path to Live's User Library folder, a leading `~` allowed
 * @param force - Replace an installed copy that's newer or can't be ordered
 * @returns What happened
 * @throws {UserLibraryFolderError} When userLibrary isn't an absolute path to an existing folder, before anything changes
 */
export function installRunningDevice(
  userLibrary: string,
  force = false,
): RunningDeviceInstall {
  const library = resolveUserLibraryFolder(userLibrary);
  const check = checkDeviceSource();

  if (check.problem != null) {
    return { status: "refused", error: PROBLEM_TEXT[check.problem] };
  }

  let result: DeviceInstallResult;

  try {
    result = installDevice(library, check.source, {
      force,
      sourceName: "this one",
    });
  } catch (error) {
    return {
      status: "failed",
      error: `Couldn't install the device: ${errorMessage(error)}`,
    };
  }

  if (result.outcome === "skipped") {
    return { status: "refused", error: result.detail, result };
  }

  if (result.outcome === "failed") {
    return {
      status: "failed",
      error: [result.detail, result.error].filter(Boolean).join(" "),
      result,
    };
  }

  // The notice is about a missing or older copy, which this just fixed.
  void syncDeviceInstallNotice();

  return { status: "done", result, library };
}
