// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reads and writes the on-disk backup of a Live Set's project context: a
// "Producer Pal Project Context.md" file sibling to the Live Set's .als, so it
// survives a device upgrade (which wipes the device's own param blob). One
// sidecar per project *folder*, shared by every .als in it — saving a new .als
// into the same folder finds the sidecar already there, and Save-As to a new
// folder is the case that needs a fresh write. See dev/Memory-System.md.
//
// This writes into the user's Live project folder (a path from the Live API's
// song file_path), NOT ~/.producer-pal, so it deliberately does NOT go through
// the config-markdown store — there is no configurable dir and no Vitest-inert
// guard here; tests point file_path at a temp dir instead.

import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "../../node-for-max-logger.ts";

/** Filename of the project-context backup, dropped beside the Live Set. */
const SIDECAR_FILENAME = "Producer Pal Project Context.md";

/**
 * Absolute path of the backup sidecar for a given Live Set file. The sidecar is
 * a sibling of the .als (one per project folder), so the path is derived from
 * the .als's directory, not its basename.
 *
 * @param liveSetPath - Absolute path to the Live Set (.als) file
 * @returns Absolute path to the sidecar markdown file
 */
export function projectContextSidecarPath(liveSetPath: string): string {
  return join(dirname(liveSetPath), SIDECAR_FILENAME);
}

/**
 * Read the backup sidecar beside the given Live Set, verbatim. A missing or
 * unreadable file yields null so the caller can distinguish "no backup" from an
 * empty backup.
 *
 * @param liveSetPath - Absolute path to the Live Set (.als) file
 * @returns Sidecar contents verbatim, or null when absent/unreadable
 */
export function readProjectContextSidecar(liveSetPath: string): string | null {
  const path = projectContextSidecarPath(liveSetPath);

  if (!existsSync(path)) return null;

  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    console.error(
      `Failed to read project context backup: ${errorMessage(error)}`,
    );

    return null;
  }
}

/**
 * Overwrite the backup sidecar beside the given Live Set (atomic temp+rename,
 * matching the config-markdown store). The content is the raw project-context
 * blob so the file round-trips byte-for-byte and stays hand-editable.
 *
 * @param liveSetPath - Absolute path to the Live Set (.als) file
 * @param content - Project-context blob to persist
 */
export function writeProjectContextSidecar(
  liveSetPath: string,
  content: string,
): void {
  const path = projectContextSidecarPath(liveSetPath);
  const tmpPath = `${path}.tmp`;

  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, path);
}

/**
 * Delete the backup sidecar beside the given Live Set, if present. Used when the
 * user clears the project context in-session so the clear propagates to disk and
 * isn't resurrected by a restore on the next device load. A missing file is a
 * no-op.
 *
 * @param liveSetPath - Absolute path to the Live Set (.als) file
 * @returns true when a sidecar was deleted, false when there was none
 */
export function deleteProjectContextSidecar(liveSetPath: string): boolean {
  const path = projectContextSidecarPath(liveSetPath);

  if (!existsSync(path)) return false;

  rmSync(path, { force: true });

  return true;
}
