// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { EMBEDDED_REMOTE_SCRIPT_FILES } from "./embedded-remote-script.ts";

// Live runs `import <folder>`, so the folder name must be a valid Python name.
const SCRIPT_FOLDER = "Producer_Pal";

/** A bad install target, which the REST route answers with a 400. */
export class RemoteScriptInstallError extends Error {}

/**
 * Write the bundled remote script into a Live User Library, replacing whatever
 * is there. The whole folder goes so removed modules and stale bytecode don't
 * linger — but the new copy is written to a sibling temp folder first, so a
 * failed write leaves the working install untouched instead of a broken one.
 * The only paths ever deleted are the script folder and that temp folder.
 *
 * `userLibrary` comes from the request, so CodeQL flags this as path
 * injection. It isn't confined on purpose: a User Library can live on any
 * drive. What's written is fixed embedded content, never request data, and
 * the server already trusts anyone who reaches it with full Live control.
 *
 * Live only scans Remote Scripts at startup, so it needs a restart.
 *
 * @param userLibrary - Path to Live's User Library folder, a leading `~` allowed
 * @returns Where the script was written
 * @throws {RemoteScriptInstallError} When userLibrary isn't an absolute path to an existing folder
 */
export function installRemoteScript(userLibrary: string): { path: string } {
  const library = expandHome(userLibrary);

  if (!isAbsolute(library)) {
    throw new RemoteScriptInstallError(`Not an absolute path: ${userLibrary}`);
  }

  if (!isFolder(library)) {
    throw new RemoteScriptInstallError(`Not a folder: ${library}`);
  }

  const path = remoteScriptPath(library);
  const temp = `${path}.tmp-${process.pid}`;

  try {
    // force: true swallows "it wasn't there", which is the normal case — a
    // temp folder only survives a crash mid-install.
    rmSync(temp, { recursive: true, force: true });
    writeScriptFiles(temp);
    rmSync(path, { recursive: true, force: true });
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });

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

/**
 * Write every embedded file into one folder.
 *
 * @param dir - The folder to write into
 */
function writeScriptFiles(dir: string): void {
  for (const [relative, contents] of Object.entries(
    EMBEDDED_REMOTE_SCRIPT_FILES,
  )) {
    const file = join(dir, relative);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents, "utf8");
  }
}

/**
 * @param path - Path to check
 * @returns Whether it exists and is a directory
 */
function isFolder(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
}
