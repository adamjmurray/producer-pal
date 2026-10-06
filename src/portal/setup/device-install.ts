// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  copyIntoLibrary,
  isLibraryFolder,
  listLibraryFolder,
  makeLibraryFolder,
  libraryModifiedMs,
  removeFromLibrary,
  renameInLibrary,
  setLibraryFileMode,
} from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import {
  DEVICE_FILE_NAME,
  type DeviceFileStatus,
  type DeviceState,
  deviceFileStatus,
} from "./device-file-status.ts";

// Temp files this code names, and nothing a user might name.
const LEFTOVER = new RegExp(
  `^${DEVICE_FILE_NAME.replace(".", "\\.")}\\.tmp-[\\da-f]{8}(-[\\da-f]{4}){3}-[\\da-f]{12}$`,
);

const INSTALLED_MODE = 0o644;

// Leftovers younger than this may belong to an install running right now.
const LEFTOVER_MIN_AGE_MS = 60_000;

// Windows refuses to replace a file that Live has open.
const IN_USE_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

export type DeviceInstallOutcome =
  | "installed"
  | "updated"
  | "current"
  | "skipped"
  | "failed";

export interface DeviceInstallResult {
  /**
   * `installed`: it wasn't there. `updated`: replaced an older, newer or
   * different file. `current`: already the bundled file. `skipped`: left
   * alone, see `detail`. `failed`: tried and couldn't.
   */
  outcome: DeviceInstallOutcome;
  /** Where the device is, or would be */
  path: string;
  /** What happened, and what the caller can do about it */
  detail: string;
  /** Whether the file at `path` is now different from before */
  changed: boolean;
  /** Folders this call made, outermost first. A failed call may leave these. */
  createdFolders: string[];
  /** A temp file that couldn't be deleted */
  tempFileLeft?: string;
  /** Why it failed */
  error?: string;
  /** Version of the device that was installed before this call */
  previousVersion?: string;
  bundledVersion?: string;
  /** Other Producer_Pal .amxd files in the User Library, never touched */
  otherCopies: string[];
}

export interface InstallDeviceOptions {
  /** Replace an installed device that's newer than the bundled one, or that can't be told apart from it by version */
  force?: boolean;
}

/**
 * Copy the bundled device into a User Library's Max MIDI Effect folder. It's
 * copied to a temp file and renamed in, so a failed copy or rename keeps the
 * old file. An older device is replaced; one that's newer, or that can't be
 * placed by version, is skipped unless `force` is set. Other copies elsewhere
 * in the library are reported, never deleted.
 *
 * A call that fails after the filesystem changed still returns: the result
 * says what changed. Live loads the device when a Set opens, so a Set that's
 * already open keeps the old one until it's reopened.
 *
 * @param userLibrary - Path to Live's User Library folder, a leading `~` allowed
 * @param sourceFile - The bundled device file
 * @param options - See {@link InstallDeviceOptions}
 * @returns What happened to the device file
 * @throws {UserLibraryFolderError} When userLibrary isn't an absolute path to an existing folder, before anything changes
 * @throws {Error} When the bundled device can't be read, before anything changes
 */
export function installDevice(
  userLibrary: string,
  sourceFile: string,
  options: InstallDeviceOptions = {},
): DeviceInstallResult {
  const status = deviceFileStatus(userLibrary, sourceFile);
  const { path, state } = status;
  const base = {
    path,
    changed: false,
    createdFolders: [],
    previousVersion: status.installedVersion,
    bundledVersion: status.bundledVersion,
    otherCopies: status.otherCopies,
  };

  if (state === "same") {
    return {
      ...base,
      outcome: "current",
      detail: "The installed device is already the bundled one.",
    };
  }

  if (
    (state === "installed-newer" || state === "different") &&
    !options.force
  ) {
    return { ...base, outcome: "skipped", detail: skipDetail(status) };
  }

  return { ...base, ...copyDevice(sourceFile, path, state) };
}

// --- Helpers below the main exports ---

function skipDetail({
  state,
  installedVersion,
  bundledVersion,
}: DeviceFileStatus): string {
  return `${skipReason(state, installedVersion, bundledVersion)} Left unchanged. Use force to replace it.`;
}

function skipReason(
  state: DeviceState,
  installed: string | undefined,
  bundled: string | undefined,
): string {
  if (state === "installed-newer") {
    return `The installed device (${installed}) is newer than the bundled one (${bundled}).`;
  }

  if (installed == null || bundled == null) {
    return "The installed device differs from the bundled one, and one of them names no version to compare.";
  }

  return `The installed device (${installed}) and the bundled one (${bundled}) differ, and their order can't be told.`;
}

type CopyOutcome = Pick<
  DeviceInstallResult,
  "outcome" | "detail" | "changed" | "createdFolders" | "tempFileLeft" | "error"
>;

/**
 * Copy to a temp file beside the destination, then rename over it.
 *
 * @param sourceFile - The bundled device file
 * @param path - The device path
 * @param state - How the installed file compared before the copy
 * @returns The outcome fields, with the failure spelled out if there was one
 */
function copyDevice(
  sourceFile: string,
  path: string,
  state: DeviceState,
): CopyOutcome {
  const folder = dirname(path);
  const temp = `${path}.tmp-${randomUUID()}`;
  const missing = missingFolders(folder);

  removeLeftovers(folder);

  let step: "prepare" | "rename" = "prepare";

  try {
    makeLibraryFolder(folder);
    copyIntoLibrary(sourceFile, temp);
    // The bundled file may be read-only, and a copy keeps that.
    setLibraryFileMode(temp, INSTALLED_MODE);
    step = "rename";
    renameInLibrary(temp, path);
  } catch (error) {
    return failure(error, temp, missing, step === "rename");
  }

  return {
    outcome: state === "not-installed" ? "installed" : "updated",
    detail:
      state === "not-installed"
        ? "Installed the device."
        : "Replaced the installed device. A Set that's already open keeps the old one until it's reopened.",
    changed: true,
    createdFolders: missing,
  };
}

/**
 * Describe a failed copy and clean up after it.
 *
 * @param error - What threw
 * @param temp - The temp file, which may or may not exist
 * @param missing - Folders that were missing before the copy, outermost first
 * @param renaming - Whether the failing step was the rename into place
 * @returns The outcome fields for a failure
 */
function failure(
  error: unknown,
  temp: string,
  missing: string[],
  renaming: boolean,
): CopyOutcome {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const tempFileLeft = deleteTemp(temp);
  const parts = [
    "Couldn't install the device. The device file was not changed.",
  ];

  if (renaming && code != null && IN_USE_CODES.has(code)) {
    parts.push(
      "It may be open in Live: close any Set that uses Producer Pal, or quit Live, and try again.",
    );
  }

  // A failed mkdir can still have made some of the folders.
  const createdFolders = missing.filter((folder) => isLibraryFolder(folder));

  if (createdFolders.length > 0) {
    parts.push(`Folders made before it failed: ${createdFolders.join(", ")}.`);
  }

  if (tempFileLeft != null) {
    parts.push(`A temp file couldn't be deleted: ${tempFileLeft}.`);
  }

  return {
    outcome: "failed",
    detail: parts.join(" "),
    changed: false,
    createdFolders,
    tempFileLeft,
    error: errorMessage(error),
  };
}

/**
 * @param temp - The temp file to delete
 * @returns The temp file's path when it couldn't be deleted
 */
function deleteTemp(temp: string): string | undefined {
  try {
    removeFromLibrary(temp);

    return undefined;
  } catch {
    return temp;
  }
}

/**
 * @param folder - A folder that may not exist
 * @returns The folders from it up that don't exist yet, outermost first
 */
function missingFolders(folder: string): string[] {
  const missing: string[] = [];
  let current = folder;

  while (!isLibraryFolder(current) && dirname(current) !== current) {
    missing.unshift(current);
    current = dirname(current);
  }

  return missing;
}

/**
 * Best-effort removal of temp files from earlier installs that went wrong.
 * Young ones are left, since another install may be writing them.
 *
 * @param folder - The folder holding the device
 */
function removeLeftovers(folder: string): void {
  try {
    for (const name of listLibraryFolder(folder)) {
      const path = join(folder, name);
      const modified = LEFTOVER.test(name) ? libraryModifiedMs(path) : null;

      if (modified != null && Date.now() - modified > LEFTOVER_MIN_AGE_MS) {
        deleteTemp(path);
      }
    }
  } catch {
    // A leftover is harmless; this install's temp file has a unique name.
  }
}
