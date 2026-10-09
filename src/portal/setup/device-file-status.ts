// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { join } from "node:path";
import { errorMessage } from "#src/shared/error-message.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import {
  libraryPathExists,
  readLibraryBytes,
} from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import { resolveUserLibraryFolder } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import { findOtherDeviceCopies } from "./other-device-copies.ts";

/** Where Live's Max for Live browser, and the remote script, look for it. */
const DEVICE_FOLDER = ["Presets", "MIDI Effects", "Max MIDI Effect"] as const;

export const DEVICE_FILE_NAME = "Producer_Pal.amxd";

// A frozen device is uncompressed and carries the server's source, which
// holds this line.
const VERSION_MARKER = Buffer.from('const VERSION = "');
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?$/;
const MAX_VERSION_LENGTH = 32;

/**
 * How the installed device compares with the bundled one.
 * - `not-installed`: nothing at the device path.
 * - `same`: identical bytes.
 * - `installed-older` / `installed-newer`: both name a version, installed is
 *   older / newer.
 * - `different`: the bytes differ and the versions can't order them: one or
 *   both name no version, or both name the same one (`2.5.0-rc1` and
 *   `2.5.0-rc2` count as the same).
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
  const bundledVersion = readDeviceVersion(bundled);

  if (!libraryPathExists(path)) {
    return { path, state: "not-installed", bundledVersion, otherCopies };
  }

  let installed: Buffer | undefined;

  try {
    installed = readLibraryBytes(path);
  } catch {
    // Unreadable (a folder, locked): all we know is that it isn't ours.
  }

  const installedVersion =
    installed == null ? undefined : readDeviceVersion(installed);

  return {
    path,
    state:
      installed == null
        ? "different"
        : compare(installed, installedVersion, bundled, bundledVersion),
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

/**
 * Find the version a frozen device was built from.
 *
 * @param bytes - Contents of an .amxd file
 * @returns The version, or undefined when the file doesn't name one
 */
export function readDeviceVersion(bytes: Buffer): string | undefined {
  let at = bytes.indexOf(VERSION_MARKER);

  while (at !== -1) {
    const start = at + VERSION_MARKER.length;
    const end = bytes.indexOf('"', start);

    if (end !== -1 && end - start <= MAX_VERSION_LENGTH) {
      const version = bytes.toString("latin1", start, end);

      if (VERSION_PATTERN.test(version)) {
        return version;
      }
    }

    at = bytes.indexOf(VERSION_MARKER, start);
  }

  return undefined;
}

function readBundled(sourceFile: string): Buffer {
  try {
    return readLibraryBytes(sourceFile);
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
  installed: Buffer,
  installedVersion: string | undefined,
  bundled: Buffer,
  bundledVersion: string | undefined,
): DeviceState {
  if (installed.equals(bundled)) {
    return "same";
  }

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
