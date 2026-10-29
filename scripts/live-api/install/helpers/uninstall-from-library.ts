// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { remoteScriptPath } from "#src/mcp-server/rpc/remote-script/install/remote-script-install.ts";
import {
  libraryPathExists,
  removeFromLibrary,
} from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import { deviceFilePath } from "#src/portal/setup/device-file/device-file-status.ts";
import { findOtherDeviceCopies } from "#src/portal/setup/device-file/other-device-copies.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { findRemoteScriptLeftovers } from "./remote-script-leftovers.ts";

export interface UninstallOptions {
  /** Remove the installed device */
  device: boolean;
  /** Remove the remote script and its temp/backup leftovers */
  remoteScript: boolean;
  /** With `device`: also remove every other Producer_Pal .amxd copy */
  otherCopies: boolean;
}

export interface UninstallResult {
  /** Paths deleted, in order */
  removed: string[];
  /** Paths that couldn't be deleted, and why. The rest were still tried. */
  failed: { path: string; error: string }[];
  /** Asked-for installs that weren't there */
  absent: string[];
  /** Other device copies left in place */
  keptCopies: string[];
  /** Whether anything under Remote Scripts was deleted */
  removedRemoteScript: boolean;
}

/**
 * Delete Producer Pal's files from a User Library. Each path is tried even if
 * an earlier one fails. Only the installed device, the remote script folder,
 * our own temp/backup folders, and (with `otherCopies`) other Producer_Pal
 * .amxd copies are ever deleted.
 *
 * @param library - Absolute path to the User Library
 * @param options - What to remove
 * @param remove - Deletes one path. Throws on failure.
 * @returns What was removed, what failed, and what was left
 */
export function uninstallFromLibrary(
  library: string,
  options: UninstallOptions,
  remove: (path: string) => void = removeFromLibrary,
): UninstallResult {
  const result: UninstallResult = {
    removed: [],
    failed: [],
    absent: [],
    keptCopies: [],
    removedRemoteScript: false,
  };
  const scriptPaths: string[] = [];
  const devicePaths = options.device
    ? collectDevice(library, options.otherCopies, result)
    : [];

  if (options.remoteScript) {
    scriptPaths.push(...collectRemoteScript(library, result));
  }

  for (const path of [...devicePaths, ...scriptPaths]) {
    try {
      remove(path);
      result.removed.push(path);
      result.removedRemoteScript ||= scriptPaths.includes(path);
    } catch (error) {
      result.failed.push({ path, error: errorMessage(error) });
    }
  }

  return result;
}

function collectDevice(
  library: string,
  otherCopies: boolean,
  result: UninstallResult,
): string[] {
  const path = deviceFilePath(library);
  const others = findOtherDeviceCopies(library, path);
  const paths: string[] = [];

  if (libraryPathExists(path)) {
    paths.push(path);
  } else {
    result.absent.push(path);
  }

  if (otherCopies) {
    paths.push(...others);
  } else {
    result.keptCopies.push(...others);
  }

  return paths;
}

function collectRemoteScript(
  library: string,
  result: UninstallResult,
): string[] {
  const path = remoteScriptPath(library);
  const paths = findRemoteScriptLeftovers(path);

  if (libraryPathExists(path)) {
    paths.unshift(path);
  } else {
    result.absent.push(path);
  }

  return paths;
}

/**
 * Say what an uninstall did, for printing.
 *
 * @param result - What {@link uninstallFromLibrary} returned
 * @param options - What was asked for
 * @returns Lines for stdout and for stderr (the failures)
 */
export function describeUninstall(
  result: UninstallResult,
  options: UninstallOptions,
): { out: string[]; err: string[] } {
  const out = [
    ...result.removed.map((path) => `Removed ${path}`),
    ...result.absent.map((path) => `Nothing to remove at ${path}`),
  ];

  if (result.keptCopies.length > 0) {
    const all = options.remoteScript ? "uninstall:all" : "uninstall:device:all";

    out.push(
      `WARNING: ${result.keptCopies.length} other Producer_Pal .amxd ${result.keptCopies.length === 1 ? "copy was" : "copies were"} left in place:`,
      ...result.keptCopies.map((path) => `  ${path}`),
      `Remove ${result.keptCopies.length === 1 ? "it" : "them"} with npm run ${all}.`,
    );
  }

  if (result.removedRemoteScript) {
    out.push(
      "Set Producer Pal's Control Surface slot to None in Live's settings, then restart Live.",
    );
  }

  return {
    out,
    err: result.failed.map(
      ({ path, error }) => `Failed to remove ${path}: ${error}`,
    ),
  };
}
