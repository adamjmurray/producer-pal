// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  listLibraryFolder,
  makeLibraryFolder,
  removeFromLibrary,
  renameInLibrary,
  setLibraryFileMode,
} from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import { isStaleLeftover } from "#src/mcp-server/rpc/remote-script/user-library/stale-leftover.ts";

const INSTALLED_MODE = 0o644;

// Windows refuses to replace a file that Live has open.
const IN_USE_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

/** Why a replace failed, and what it left. */
export interface ReplaceFailure {
  error: unknown;
  /** Whether the failing step was the rename into place */
  renaming: boolean;
  /** A temp file that couldn't be deleted */
  tempFileLeft?: string;
}

/**
 * Put a file in place without ever leaving a half-written one: write a temp
 * file beside it, then rename over it. A failure keeps the old file. Missing
 * folders are made.
 *
 * @param path - Where the file goes
 * @param writeTemp - Writes the new contents to the temp path it is given
 * @returns Nothing when it worked, else what went wrong
 */
export function replaceViaTemp(
  path: string,
  writeTemp: (temp: string) => void,
): ReplaceFailure | undefined {
  const temp = `${path}.tmp-${randomUUID()}`;
  let renaming = false;

  try {
    makeLibraryFolder(dirname(path));
    writeTemp(temp);
    // The source may be read-only, and a copy keeps that.
    setLibraryFileMode(temp, INSTALLED_MODE);
    renaming = true;
    renameInLibrary(temp, path);

    return undefined;
  } catch (error) {
    return { error, renaming, tempFileLeft: deleteTemp(temp) };
  }
}

/**
 * @param failure - What a replace reported
 * @param failure.error - What threw
 * @param failure.renaming - Whether the rename was the failing step
 * @returns Whether Windows refused the rename because Live has the file open
 */
export function isInUseFailure({ error, renaming }: ReplaceFailure): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;

  return renaming && code != null && IN_USE_CODES.has(code);
}

/**
 * Best-effort removal of temp files that earlier installs of a file left
 * behind. Young ones are left, since another install may be writing them.
 *
 * @param folder - The folder holding the file
 * @param fileName - The file whose temp files to remove
 */
export function removeStaleTempFiles(folder: string, fileName: string): void {
  // Temp files this code names, and nothing a user might name.
  const leftover = new RegExp(
    `^${escapeRegExp(fileName)}\\.tmp-[\\da-f]{8}(-[\\da-f]{4}){3}-[\\da-f]{12}$`,
  );

  try {
    for (const name of listLibraryFolder(folder)) {
      const path = join(folder, name);

      if (leftover.test(name) && isStaleLeftover(path)) {
        deleteTemp(path);
      }
    }
  } catch {
    // A leftover is harmless; the next install's temp file has a unique name.
  }
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
 * @param text - Text to match literally
 * @returns It with every regex character escaped
 */
function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
