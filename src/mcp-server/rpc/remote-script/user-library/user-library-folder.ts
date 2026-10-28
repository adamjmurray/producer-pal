// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { isLibraryFolder } from "./user-library-fs.ts";

/** A bad User Library target, which the REST route answers with a 400. */
export class UserLibraryFolderError extends Error {}

/**
 * Check that a path names an existing User Library folder.
 *
 * @param userLibrary - Path to Live's User Library folder, a leading `~` allowed
 * @returns The absolute path, with any `~` expanded
 * @throws {UserLibraryFolderError} When it isn't an absolute path to an existing folder
 */
export function resolveUserLibraryFolder(userLibrary: string): string {
  const library = expandHome(userLibrary);

  if (!isAbsolute(library)) {
    throw new UserLibraryFolderError(`Not an absolute path: ${userLibrary}`);
  }

  if (!isLibraryFolder(library)) {
    throw new UserLibraryFolderError(`Not a folder: ${library}`);
  }

  return library;
}

/**
 * Expand a leading `~` to the user's home folder. Live shows the User Library
 * path with a `~`, and that's what people paste in.
 *
 * @param path - A path, possibly starting with `~`
 * @returns The path with a leading `~` replaced
 */
function expandHome(path: string): string {
  if (path === "~") {
    return homedir();
  }

  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}
