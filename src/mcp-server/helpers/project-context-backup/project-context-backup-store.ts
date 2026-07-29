// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reads and writes the on-disk backup of a Live Set's project context: a
// "<Set name> - Producer Pal Project Context.md" file sibling to the Live Set's
// .als, so it survives a device upgrade (which wipes the device's own param
// blob). One sidecar per *Set*, not per folder: the blob it backs up lives in a
// per-Set device param, so a folder-wide file would let two Sets in one folder
// (the ordinary Save-As-in-place workflow, e.g. "Song.als" + "Song (alt
// mix).als") overwrite each other's backup and then restore the wrong Set's
// notes after an upgrade. See dev/Memory-System.md.
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
import { basename, dirname, extname, join } from "node:path";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "../../node-for-max-logger.ts";

/** Filename suffix of the project-context backup, dropped beside the Live Set. */
const SIDECAR_SUFFIX = " - Producer Pal Project Context.md";

/**
 * Absolute path of the backup sidecar for a given Live Set file: a sibling of
 * the .als named after it, so each Set in a shared project folder gets its own
 * backup. The name comes from an existing filename, so it needs no sanitizing.
 *
 * @param liveSetPath - Absolute path to the Live Set (.als) file
 * @returns Absolute path to the sidecar markdown file
 */
export function projectContextSidecarPath(liveSetPath: string): string {
  const setName = basename(liveSetPath, extname(liveSetPath));

  return join(dirname(liveSetPath), `${setName}${SIDECAR_SUFFIX}`);
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
