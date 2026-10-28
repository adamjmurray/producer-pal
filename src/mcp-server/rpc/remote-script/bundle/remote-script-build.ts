// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A remote script's build ID: a hash of its files, so two copies of one version
// can be told apart. hot_reload.py hashes what Live loaded the same way and
// reports it from /ping as `script_build`; the two must stay in step
// (FIXTURE_BUILD_HASH in both languages' tests).

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { EMBEDDED_REMOTE_SCRIPT_FILES } from "./embedded-remote-script.ts";

/**
 * Written beside the installed script: the installing device's commit SHA.
 * Not a .py file, so it stays out of the build ID. version.py reads it.
 */
export const BUILD_COMMIT_FILE = "BUILD_COMMIT";

/**
 * The build ID of a script's files: the hash over every top-level .py file.
 * Files in subfolders, dot-files and other extensions don't count, as in
 * hot_reload.py's `script_files`.
 * @param files - Path relative to the script folder, to contents
 * @returns The SHA-256 as lowercase hex
 */
export function remoteScriptBuild(
  files: Record<string, string | Buffer>,
): string {
  return hashScriptFiles(
    Object.fromEntries(
      Object.entries(files).filter(([name]) => isTopLevelSource(name)),
    ),
  );
}

/**
 * Hash files the way hot_reload.py does. Per file, in name order:
 * `<name>\0<sha256 of its bytes>\n`.
 * @param files - File name to contents
 * @returns The SHA-256 as lowercase hex
 */
export function hashScriptFiles(
  files: Record<string, string | Buffer>,
): string {
  const digest = createHash("sha256");
  // Byte order, like Python's sort of the same names.
  const names = Object.keys(files).toSorted((a, b) =>
    Buffer.compare(Buffer.from(a), Buffer.from(b)),
  );

  for (const name of names) {
    const contentHash = createHash("sha256")
      .update(files[name] as string | Buffer)
      .digest("hex");

    digest.update(`${name}\0${contentHash}\n`);
  }

  return digest.digest("hex");
}

let bundledBuild: string | undefined;

/** @returns The build ID of the script this device installs */
export function bundledRemoteScriptBuild(): string {
  bundledBuild ??= remoteScriptBuild(EMBEDDED_REMOTE_SCRIPT_FILES);

  return bundledBuild;
}

/**
 * The build ID of a script folder on disk. Never throws.
 * @param dir - An installed Producer_Pal folder
 * @returns The build ID, or null when the folder can't be read
 */
export function installedRemoteScriptBuild(dir: string): string | null {
  try {
    const files: Record<string, Buffer> = {};

    for (const name of readdirSync(dir)) {
      if (isTopLevelSource(name) && statSync(join(dir, name)).isFile()) {
        files[name] = readFileSync(join(dir, name));
      }
    }

    return remoteScriptBuild(files);
  } catch {
    return null;
  }
}

/**
 * @param name - A path relative to the script folder
 * @returns Whether it is a top-level .py file that isn't a dot-file
 */
function isTopLevelSource(name: string): boolean {
  return name.endsWith(".py") && !name.startsWith(".") && !name.includes("/");
}
