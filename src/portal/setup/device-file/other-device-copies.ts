// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { join } from "node:path";
import {
  listLibraryEntries,
  type LibraryEntry,
} from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";

// Producer_Pal.amxd, plus renamed or numbered copies (`Producer_Pal 2.amxd`).
const DEVICE_COPY = /^producer[ _]pal.*\.amxd$/i;

// Big, and never where a device is saved or where Live's browser looks.
const SKIPPED_FOLDERS = new Set(["Samples", "Remote Scripts"]);
const MAX_DEPTH = 6;

/**
 * List Producer_Pal .amxd files in a User Library other than the installed
 * one. A second copy makes adding the device to a Set ambiguous, so callers
 * warn about these. They're never touched. Folders that can't be read are
 * skipped.
 *
 * @param userLibrary - Absolute path to Live's User Library folder
 * @param installedPath - The device file to leave out
 * @returns Absolute paths of the other copies
 */
export function findOtherDeviceCopies(
  userLibrary: string,
  installedPath: string,
): string[] {
  const found: string[] = [];

  scan(userLibrary, 0, found);

  // Live's platforms ignore case, so a differently-cased name is the same file.
  const installed = installedPath.toLowerCase();

  return found.filter((path) => path.toLowerCase() !== installed).toSorted();
}

function scan(folder: string, depth: number, found: string[]): void {
  let entries: LibraryEntry[];

  try {
    entries = listLibraryEntries(folder);
  } catch {
    return;
  }

  for (const { name, isFolder } of entries) {
    const path = join(folder, name);

    if (!isFolder && DEVICE_COPY.test(name)) {
      found.push(path);
    } else if (isFolder && depth < MAX_DEPTH && !SKIPPED_FOLDERS.has(name)) {
      scan(path, depth + 1, found);
    }
  }
}
