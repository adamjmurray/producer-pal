// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  copyIntoLibrary,
  libraryPathExists,
  makeLibraryFolder,
  readLibraryBytes,
  removeFromLibrary,
  renameInLibrary,
  setLibraryFileMode,
} from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import { errorMessage } from "#src/shared/error-message.ts";

const INSTALLED_MODE = 0o644;

/** Where each wrapper goes: the folder Live files that device type under. */
export const PLUGIN_HOST_WRAPPERS = [
  {
    fileName: "PPal Plug-in Effect.amxd",
    folder: ["Presets", "Audio Effects", "Max Audio Effect"],
  },
  {
    fileName: "PPal Plug-in Instrument.amxd",
    folder: ["Presets", "Instruments", "Max Instrument"],
  },
] as const;

export interface PluginHostInstallResult {
  fileName: string;
  /** Where the wrapper is, or would be */
  path: string;
  /** `current`: already the repo file */
  outcome: "installed" | "updated" | "current" | "failed";
  error?: string;
}

/**
 * Where the wrapper source files live in the repo.
 *
 * @param rootDir - The repo root
 * @param fileName - A wrapper file name
 * @returns Absolute path to the repo file
 */
export function pluginHostSourcePath(
  rootDir: string,
  fileName: string,
): string {
  return join(rootDir, "max-for-live-device", "plugin-host", fileName);
}

/**
 * Copy the wrapper devices into the User Library, replacing any that differ.
 * Each is copied to a temp file and renamed in, so a failed copy keeps the old
 * file. A failure on one wrapper doesn't stop the other.
 *
 * Live loads a device when a Set opens, so a Set that's already open keeps the
 * old wrapper until it's reopened.
 *
 * @param userLibrary - Absolute path to an existing User Library
 * @param rootDir - The repo root
 * @returns One result per wrapper
 * @throws {Error} When a wrapper source file is missing, before anything changes
 */
export function installPluginHostWrappers(
  userLibrary: string,
  rootDir: string,
): PluginHostInstallResult[] {
  for (const { fileName } of PLUGIN_HOST_WRAPPERS) {
    const source = pluginHostSourcePath(rootDir, fileName);

    if (!existsSync(source)) {
      throw new Error(`${source} not found.`);
    }
  }

  return PLUGIN_HOST_WRAPPERS.map(({ fileName, folder }) =>
    installWrapper(
      pluginHostSourcePath(rootDir, fileName),
      join(userLibrary, ...folder),
      fileName,
    ),
  );
}

/**
 * Say what an install did, for printing.
 *
 * @param results - What `installPluginHostWrappers` returned
 * @returns Lines to print, and whether every wrapper ended up installed
 */
export function describePluginHostInstall(results: PluginHostInstallResult[]): {
  lines: string[];
  ok: boolean;
} {
  const lines = results.map(({ outcome, path, error }) =>
    outcome === "failed"
      ? `failed: ${path} (${error})`
      : `${outcome === "current" ? "already current" : outcome}: ${path}`,
  );

  if (results.some(({ outcome }) => outcome === "updated")) {
    lines.push(
      "A Set that's already open keeps the old wrapper until it's reopened.",
    );
  }

  return { lines, ok: results.every(({ outcome }) => outcome !== "failed") };
}

// --- Helpers below the main exports ---

function installWrapper(
  source: string,
  folder: string,
  fileName: string,
): PluginHostInstallResult {
  const path = join(folder, fileName);
  const temp = `${path}.tmp-${randomUUID()}`;

  try {
    const existed = libraryPathExists(path);

    if (existed && readLibraryBytes(path).equals(readLibraryBytes(source))) {
      return { fileName, path, outcome: "current" };
    }

    makeLibraryFolder(folder);
    copyIntoLibrary(source, temp);
    // A copy keeps the source's permissions, which may be read-only.
    setLibraryFileMode(temp, INSTALLED_MODE);
    renameInLibrary(temp, path);

    return { fileName, path, outcome: existed ? "updated" : "installed" };
  } catch (error) {
    removeTemp(temp);

    return { fileName, path, outcome: "failed", error: errorMessage(error) };
  }
}

function removeTemp(temp: string): void {
  try {
    removeFromLibrary(temp);
  } catch {
    // Nothing more to do; the name is unique, so it never collides.
  }
}
