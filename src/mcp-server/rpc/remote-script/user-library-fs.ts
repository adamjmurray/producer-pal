// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Every fs call on a path from a request goes through this file.
//
// The remote script install takes the User Library folder from the REST
// request, so CodeQL's path-injection check flags each fs call that uses it.
// That's accepted: the local user picks the folder, like a file picker, and a
// User Library can live on any drive, so it isn't confined. What's written is
// fixed embedded files, never request data, and only the Producer_Pal folder
// in <folder>/Remote Scripts, plus the temp and backup folders the install
// makes beside it, is ever deleted. The server has no auth by design: reaching
// it already grants full Live control, so this adds nothing.
//
// Keeping the calls here puts the alerts on these few lines, dismissed once as
// "won't fix". Don't call node:fs on such a path anywhere else. Editing a line
// below that calls fs re-raises its alert; dismiss it again with this reason.

import {
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/**
 * @param path - Path to check
 * @returns Whether anything is there, a broken link included
 */
export function libraryPathExists(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) != null;
}

/**
 * @param path - Path to check
 * @returns Whether it exists and is a folder
 */
export function isLibraryFolder(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
}

/**
 * @param folder - Folder to list
 * @returns The names in it
 */
export function listLibraryFolder(folder: string): string[] {
  return readdirSync(folder);
}

/**
 * @param from - Current path
 * @param to - New path
 */
export function renameInLibrary(from: string, to: string): void {
  renameSync(from, to);
}

/**
 * Delete a file or folder and everything in it. Nothing there is fine.
 *
 * @param path - Path to delete
 */
export function removeFromLibrary(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

/**
 * Write a UTF-8 file, creating its parent folders.
 *
 * @param file - Path to write
 * @param contents - File contents
 */
export function writeLibraryFile(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}
