// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { deviceFileFacts } from "#src/portal/setup/device-file/device-file-facts.ts";
import {
  deviceFilePath,
  deviceFileStatus,
} from "#src/portal/setup/device-file/device-file-status.ts";
import { VERSION } from "#src/shared/config.ts";
import {
  type DeviceInstallProblem,
  type DeviceInstallStatus,
} from "#src/shared/max/device-install-status.ts";
import { findUserLibraryPath } from "../../live-library/query/user-library-path.ts";
import { resolveUserLibraryFolder } from "../remote-script/user-library/user-library-folder.ts";
import { libraryRealPath } from "../remote-script/user-library/user-library-fs.ts";
import {
  askDeviceToReport,
  deviceSourcePath,
  isFrozenDevice,
} from "./device-source.ts";

export type { DeviceInstallProblem, DeviceInstallStatus };

/**
 * Compare the running device with the copy in the User Library. Changes
 * nothing.
 *
 * @param given - A User Library path to use instead of looking for one
 * @returns The status, with a `problem` when the device can't be installed
 * @throws {UserLibraryFolderError} When `given` isn't an absolute path to an existing folder
 */
export async function deviceInstallStatus(
  given?: string,
): Promise<DeviceInstallStatus> {
  const trimmed = (given ?? "").trim();
  const userLibrary =
    trimmed === ""
      ? await findUserLibraryPath()
      : resolveUserLibraryFolder(trimmed);
  const check = checkDeviceSource();
  const base = {
    source: check.source,
    userLibrary,
    path: null,
    inUserLibrary:
      userLibrary != null &&
      check.source != null &&
      isSameFile(check.source, deviceFilePath(userLibrary)),
    state: null,
    version: VERSION,
    installedVersion: null,
    otherCopies: [],
  };

  if (check.problem != null) {
    return { ...base, problem: check.problem };
  }

  if (userLibrary == null) {
    return { ...base, problem: "no-user-library" };
  }

  const status = deviceFileStatus(userLibrary, check.source);

  return {
    ...base,
    problem: null,
    path: status.path,
    state: status.state,
    installedVersion: status.installedVersion ?? null,
    otherCopies: status.otherCopies,
  };
}

/** The running device's file, or why it can't be copied. */
export type DeviceSourceCheck =
  | { source: string; problem: null }
  | {
      source: string | null;
      problem: Exclude<DeviceInstallProblem, "no-user-library">;
    };

/**
 * Check that the reported device file is one that can be copied.
 *
 * @returns The file when it can be, else what's wrong with it
 */
export function checkDeviceSource(): DeviceSourceCheck {
  const source = deviceSourcePath();

  if (source == null) {
    // The first ask may have gone out before V8 was ready.
    askDeviceToReport();

    return { source, problem: "unknown-source" };
  }

  try {
    return isFrozenDevice(deviceFileFacts(source).header)
      ? { source, problem: null }
      : { source, problem: "not-frozen" };
  } catch {
    return { source, problem: "unreadable-source" };
  }
}

/**
 * @param a - A file path
 * @param b - Another
 * @returns Whether both exist and are the same file, however each is spelled
 *   (links, case)
 */
function isSameFile(a: string, b: string): boolean {
  const real = libraryRealPath(a);

  return real != null && real === libraryRealPath(b);
}
