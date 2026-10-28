// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { join } from "node:path";
import { errorMessage } from "#src/shared/error-message.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { libraryPathExists } from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import { resolveUserLibraryFolder } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import { type DeviceFileFacts, deviceFileFacts } from "./device-file-facts.ts";
import { findOtherDeviceCopies } from "./other-device-copies.ts";

/** Where Live's Max for Live browser, and the remote script, look for it. */
const DEVICE_FOLDER = ["Presets", "MIDI Effects", "Max MIDI Effect"] as const;

export const DEVICE_FILE_NAME = "Producer_Pal.amxd";

/**
 * How the installed device compares with the bundled one.
 * - `not-installed`: nothing at the device path.
 * - `same`: identical bytes.
 * - `installed-older` / `installed-newer`: both name a version, installed is
 *   older / newer.
 * - `different`: the bytes differ and the versions can't order them: one or
 *   both name no version, both name the same one, or their tags can't be
 *   ordered (`-beta` vs `-rc1`).
 */
export type DeviceState =
  | "not-installed"
  | "same"
  | "installed-older"
  | "installed-newer"
  | "different";

export interface DeviceFileStatus {
  /** Where the device is installed, or would be */
  path: string;
  state: DeviceState;
  /** Version in the installed file, when it names one */
  installedVersion?: string;
  /** Version in the bundled file, when it names one */
  bundledVersion?: string;
  /** Other Producer_Pal .amxd files in the User Library */
  otherCopies: string[];
}

/**
 * Compare the device installed in a User Library with the bundled one.
 * Changes nothing. Never deletes: other copies are only listed.
 *
 * @param userLibrary - Path to Live's User Library folder, a leading `~` allowed
 * @param sourceFile - The bundled device file
 * @returns What's installed, how it compares, and any other copies
 * @throws {UserLibraryFolderError} When userLibrary isn't an absolute path to an existing folder
 * @throws {Error} When the bundled device can't be read
 */
export function deviceFileStatus(
  userLibrary: string,
  sourceFile: string,
): DeviceFileStatus {
  const library = resolveUserLibraryFolder(userLibrary);
  const path = deviceFilePath(library);
  const bundled = readBundled(sourceFile);
  const otherCopies = findOtherDeviceCopies(library, path);
  const bundledVersion = bundled.version;

  if (!libraryPathExists(path)) {
    return { path, state: "not-installed", bundledVersion, otherCopies };
  }

  let installed: DeviceFileFacts | undefined;

  try {
    installed = deviceFileFacts(path);
  } catch {
    // Unreadable (a folder, locked): all we know is that it isn't ours.
  }

  const installedVersion = installed?.version;

  return {
    path,
    state: installed == null ? "different" : compare(installed, bundled),
    installedVersion,
    bundledVersion,
    otherCopies,
  };
}

/**
 * Where the device lives inside a User Library.
 *
 * @param userLibrary - Absolute path to Live's User Library folder
 * @returns Absolute path to the .amxd, installed or not
 */
export function deviceFilePath(userLibrary: string): string {
  return join(userLibrary, ...DEVICE_FOLDER, DEVICE_FILE_NAME);
}

function readBundled(sourceFile: string): DeviceFileFacts {
  try {
    return deviceFileFacts(sourceFile);
  } catch (error) {
    throw new Error(
      `The bundled device can't be read: ${errorMessage(error)}`,
      {
        cause: error,
      },
    );
  }
}

function compare(
  installed: DeviceFileFacts,
  bundled: DeviceFileFacts,
): DeviceState {
  if (installed.digest === bundled.digest) {
    return "same";
  }

  const { version: installedVersion } = installed;
  const { version: bundledVersion } = bundled;

  if (installedVersion == null || bundledVersion == null) {
    return "different";
  }

  if (isNewerVersion(installedVersion, bundledVersion)) {
    return "installed-older";
  }

  return isNewerVersion(bundledVersion, installedVersion)
    ? "installed-newer"
    : "different";
}
