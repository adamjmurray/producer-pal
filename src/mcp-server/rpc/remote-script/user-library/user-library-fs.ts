// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Every fs call on a path from a request goes through this file. The device
// install (src/portal/setup/) follows the same rule.
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
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
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

export interface LibraryEntry {
  name: string;
  isFolder: boolean;
}

/**
 * Like `listLibraryFolder`, but says which names are folders. A link to a
 * folder counts as a file, so a walk never follows one out of the library.
 *
 * @param folder - Folder to list
 * @returns The names in it, each flagged as a folder or not
 */
export function listLibraryEntries(folder: string): LibraryEntry[] {
  return readdirSync(folder, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    isFolder: entry.isDirectory(),
  }));
}

/**
 * @param file - File to read
 * @returns The file's bytes
 */
export function readLibraryBytes(file: string): Buffer {
  return readFileSync(file);
}

/**
 * Copy a file, replacing the destination if it's there.
 *
 * @param from - File to copy
 * @param to - Where the copy goes
 */
export function copyIntoLibrary(from: string, to: string): void {
  copyFileSync(from, to);
}

/**
 * @param file - File to change
 * @param mode - Permission bits
 */
export function setLibraryFileMode(file: string, mode: number): void {
  chmodSync(file, mode);
}

/**
 * @param path - Path to check
 * @returns When it was last modified, in epoch ms, or undefined when it's gone
 */
export function libraryModifiedMs(path: string): number | undefined {
  return statSync(path, { throwIfNoEntry: false })?.mtimeMs;
}

/**
 * Make a folder and any missing parents. A folder that's there is fine.
 *
 * @param folder - Folder to make
 */
export function makeLibraryFolder(folder: string): void {
  mkdirSync(folder, { recursive: true });
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
