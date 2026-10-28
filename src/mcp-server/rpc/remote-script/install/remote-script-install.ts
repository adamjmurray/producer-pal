// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { BUILD_SHA } from "#src/shared/config.ts";
import { EMBEDDED_REMOTE_SCRIPT_FILES } from "../bundle/embedded-remote-script.ts";
import { BUILD_COMMIT_FILE } from "../bundle/remote-script-build.ts";
import {
  libraryPathExists,
  listLibraryFolder,
  removeFromLibrary,
  renameInLibrary,
  writeLibraryFile,
} from "../user-library/user-library-fs.ts";
import { isStaleLeftover } from "../user-library/stale-leftover.ts";
import { resolveUserLibraryFolder } from "../user-library/user-library-folder.ts";

// Live runs `import <folder>`, so the folder name must be a valid Python name.
const SCRIPT_FOLDER = "Producer_Pal";

// Temp and backup folders this code names, and nothing a user might name.
// Exported so the dev uninstall script can remove them.
export const REMOTE_SCRIPT_LEFTOVER = new RegExp(
  `^${SCRIPT_FOLDER}\\.(tmp|old)-[\\da-f]{8}(-[\\da-f]{4}){3}-[\\da-f]{12}$`,
);

/**
 * Write the bundled remote script into a Live User Library, replacing whatever
 * is there. The whole folder goes so removed modules and stale bytecode don't
 * linger. The new copy is written to a sibling temp folder and swapped in, so
 * a failed write or swap keeps the working install (under a backup name only
 * if putting it back fails too). The error says where anything was left. The
 * only paths ever deleted are temp and backup folders.
 *
 * Live only scans Remote Scripts at startup, so it needs a restart.
 *
 * @param userLibrary - Path to Live's User Library folder, a leading `~` allowed
 * @returns Where the script was written
 * @throws {UserLibraryFolderError} When userLibrary isn't an absolute path to an existing folder
 */
export function installRemoteScript(userLibrary: string): { path: string } {
  const path = remoteScriptPath(resolveUserLibraryFolder(userLibrary));
  // Unique names, so a leftover that can't be removed never blocks an install.
  const temp = `${path}.tmp-${randomUUID()}`;
  const backup = `${path}.old-${randomUUID()}`;

  removeLeftovers(path);

  try {
    writeScriptFiles(temp);
    swapInstall(temp, path, backup);
  } catch (error) {
    try {
      removeFromLibrary(temp);
    } catch {
      noteLeftAt(error, `new copy left at ${temp}`);
    }

    throw error;
  }

  return { path };
}

/**
 * Where the remote script lives inside a User Library.
 *
 * @param userLibrary - Absolute path to Live's User Library folder
 * @returns Absolute path to the script folder, installed or not
 */
export function remoteScriptPath(userLibrary: string): string {
  return join(userLibrary, "Remote Scripts", SCRIPT_FOLDER);
}

// --- Helpers below the main exports ---

/**
 * Move the new copy into place, keeping the old install as a backup until the
 * new one is in, and putting it back if that fails.
 *
 * @param temp - The folder holding the new copy
 * @param path - The script folder
 * @param backup - Where the old install waits during the swap
 */
function swapInstall(temp: string, path: string, backup: string): void {
  const hadInstall = libraryPathExists(path);

  if (hadInstall) {
    renameInLibrary(path, backup);
  }

  try {
    renameInLibrary(temp, path);
  } catch (error) {
    if (hadInstall) {
      restoreBackup(backup, path, error);
    }

    throw error;
  }

  try {
    removeFromLibrary(backup);
  } catch {
    // The new install is already in, so don't report the install as failed.
  }
}

/**
 * Put the old install back after a failed swap. If that fails too, add where
 * it was left to the swap's error, which is the one worth reporting.
 *
 * @param backup - Where the old install is
 * @param path - The script folder
 * @param swapError - Why the swap failed
 */
function restoreBackup(backup: string, path: string, swapError: unknown): void {
  try {
    renameInLibrary(backup, path);
  } catch {
    noteLeftAt(swapError, `old install left at ${backup}`);
  }
}

/**
 * Add what a failure left behind to its error, so a cleanup that also fails
 * never hides the first error.
 *
 * @param error - The failure being reported
 * @param note - What was left where
 */
function noteLeftAt(error: unknown, note: string): void {
  if (error instanceof Error) {
    error.message += ` (${note})`;
  }
}

/**
 * Best-effort removal of temp and backup folders from earlier installs that
 * went wrong, in this process or any other. Young temp folders are left, since
 * another install may be writing them.
 *
 * @param path - The script folder
 */
function removeLeftovers(path: string): void {
  const folder = dirname(path);
  // With no install, a backup may be the only copy of the old one.
  const keepBackups = !libraryPathExists(path);
  let names: string[];

  try {
    names = listLibraryFolder(folder);
  } catch {
    return;
  }

  for (const name of names) {
    const kind = REMOTE_SCRIPT_LEFTOVER.exec(name)?.[1];
    const leftover = join(folder, name);

    if (
      (kind === "tmp" && isStaleLeftover(leftover)) ||
      (kind === "old" && !keepBackups)
    ) {
      try {
        removeFromLibrary(leftover);
      } catch {
        // A leftover is harmless; the new one gets a unique name.
      }
    }
  }
}

/**
 * Write every embedded file into one folder, plus the commit it came from.
 *
 * @param dir - The folder to write into
 */
function writeScriptFiles(dir: string): void {
  for (const [relative, contents] of Object.entries(
    EMBEDDED_REMOTE_SCRIPT_FILES,
  )) {
    writeLibraryFile(join(dir, relative), contents);
  }

  if (BUILD_SHA !== "") {
    writeLibraryFile(join(dir, BUILD_COMMIT_FILE), `${BUILD_SHA}\n`);
  }
}
