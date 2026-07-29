// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reads and writes the on-disk backup of a Live Set's project context: a
// "Producer Pal Project Context.md" file sibling to the Live Set's .als, so it
// survives a device upgrade (which wipes the device's own param blob).
//
// ONE SIDECAR PER PROJECT FOLDER, shared by every .als in it. This is a
// requirement, not an implementation detail — do not "fix" it by keying the
// filename on the .als basename. A Live Project is a folder holding one or more
// Sets, and the variations/versions inside it (Song.als, Song (alt mix).als,
// Song v2.als) are the same project: they share its genre, arrangement, and
// track roles, so they share its notes. One file, peer to the .als files.
//
// Two consequences that look like bugs and are not:
//   - Last writer wins. The sidecar holds the last written project context of
//     ANY Set in the folder. A fresh device in any of those Sets restores that
//     shared blob, which is the intent — not cross-contamination.
//   - Nothing verifies which .als a sidecar came from, because nothing should.
//
// Keying on the .als basename would also break the two things this must survive:
// renaming a Set inside the folder, and moving the folder. That is the same
// reason dev/Memory-System.md rejects a central ~/.producer-pal store keyed by
// set path. Deriving the sidecar name from a path re-introduces exactly the
// fragility the design avoids; deriving it from the folder does not.
//
// Because last-writer-wins is folder-wide, only a genuine WRITE may overwrite
// an existing sidecar whose content differs (the `isEdit` flag on the sync RPC
// — see project-context-backup-node-routes.ts). A device load and a passing
// pre-tool-call sync only observe the param, so reopening an OLDER Set can't
// push its stale saved blob over the folder's newer notes. A MISSING sidecar is
// still always created, which is what covers a first save, a Save-As, and a
// moved project folder.
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
 * Absolute path of the backup sidecar for a given Live Set file. Derived from
 * the .als's DIRECTORY and never its basename, so every Set in a Live Project
 * shares one sidecar and a Set can be renamed without orphaning it. See the
 * file header before changing this — the folder keying is a requirement.
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
