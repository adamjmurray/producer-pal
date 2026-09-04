// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Addressing tracks and scenes by where they are instead of by id, so a caller
// that just read a Set can act on what it found without carrying ids around.
//
// On a tool taking a list, a path that names the wrong kind of thing, or
// nothing at all, warns and contributes nothing — the same as an id that
// doesn't resolve, so one bad entry costs its own object rather than the whole
// batch. A read naming one object has nothing left to return, so it throws.
//
// A hole in the list itself ("t0,,t1") is neither: nothing can line up against
// a list whose length is a guess, so it throws before anything runs, like a
// hole in `id`.

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  pathEntries,
  trackSegmentPath,
} from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import {
  isNewObjectPath,
  NEW_OBJECT_NOUNS,
  parseObjectPath,
  type ObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import { pathError } from "#src/tools/shared/validation/helpers/object-path-lexer.ts";

/**
 * Resolves track path(s) to the ids of the tracks they name.
 * @param paths - Comma-separated track paths (e.g. "t0,rt1,mt")
 * @param label - Param name the paths came from, for warnings
 * @returns One track id per path entry, null where a path named none
 */
export function trackIdPerPath(
  paths: string,
  label = "path",
): Array<string | null> {
  return idPerPath(paths, label, (path, entry) =>
    trackAtPath(path, entry, label),
  );
}

/**
 * Resolves scene path(s) to the ids of the scenes they name.
 * @param paths - Comma-separated scene paths (e.g. "s0,s3")
 * @param label - Param name the paths came from, for warnings
 * @returns One scene id per path entry, null where a path named none
 */
export function sceneIdPerPath(
  paths: string,
  label = "path",
): Array<string | null> {
  return idPerPath(paths, label, (path, entry) =>
    sceneAtPath(path, entry, label),
  );
}

/**
 * The track a single path names, for a read that has nothing to return when
 * the path is bad and so throws instead of warning.
 * @param entry - One track path (e.g. "t0", "rt1", "mt")
 * @param label - Param name the path came from, for the error
 * @returns The track it names
 */
export function trackApiAtPath(entry: string, label = "path"): LiveAPI {
  return existing(
    trackAtPath(parseObjectPath(entry, label), entry, label),
    entry,
    label,
  );
}

/**
 * The scene a single path names. Throws like {@link trackApiAtPath}.
 * @param entry - One scene path (e.g. "s3")
 * @param label - Param name the path came from, for the error
 * @returns The scene it names
 */
export function sceneApiAtPath(entry: string, label = "path"): LiveAPI {
  return existing(
    sceneAtPath(parseObjectPath(entry, label), entry, label),
    entry,
    label,
  );
}

// --- Helpers below main exports ---

/**
 * The track a parsed path names, or throws saying what it named instead.
 * @param path - A parsed path
 * @param entry - The path as written, for the error
 * @param label - Param name the path came from, for the error
 * @returns The track it names
 */
function trackAtPath(path: ObjectPath, entry: string, label: string): LiveAPI {
  if (
    path.kind !== "track" &&
    path.kind !== "return-track" &&
    path.kind !== "master-track"
  ) {
    throw pathError(
      label,
      entry,
      `names ${describePathKind(path)}, not a track; expected "t<index>", "rt<index>", or "mt"`,
    );
  }

  return LiveAPI.from(trackSegmentPath(path));
}

/**
 * The scene a parsed path names, or throws saying what it named instead.
 * @param path - A parsed path
 * @param entry - The path as written, for the error
 * @param label - Param name the path came from, for the error
 * @returns The scene it names
 */
function sceneAtPath(path: ObjectPath, entry: string, label: string): LiveAPI {
  if (path.kind !== "scene") {
    throw pathError(
      label,
      entry,
      `names ${describePathKind(path)}, not a scene; expected "s<index>"`,
    );
  }

  return LiveAPI.from(livePath.scene(path.sceneIndex));
}

/**
 * Passes an object through, or throws when the path named nothing.
 * @param object - What the path resolved to
 * @param entry - The path as written, for the error
 * @param label - Param name the path came from, for the error
 * @returns The object
 */
function existing(object: LiveAPI, entry: string, label: string): LiveAPI {
  if (!object.exists()) {
    throw new Error(`nothing at ${label} "${entry}"`);
  }

  return object;
}

/**
 * Resolves each entry through a type-specific lookup, keeping one slot per
 * path so a caller pairing paths against another list keeps its positions.
 * @param paths - The raw path param
 * @param label - Param name the paths came from, for warnings
 * @param resolve - Turns a parsed path into the object it names, or throws
 * @returns One id per path entry, null where a path named none
 */
function idPerPath(
  paths: string,
  label: string,
  resolve: (path: ObjectPath, entry: string) => LiveAPI,
): Array<string | null> {
  const ids: Array<string | null> = [];

  for (const entry of pathEntries(paths, label)) {
    try {
      const object = resolve(parseObjectPath(entry, label), entry);

      if (object.exists()) {
        ids.push(object.id);
        continue;
      }

      console.warn(`nothing at ${label} "${entry}"`);
    } catch (error) {
      console.warn(errorMessage(error));
    }

    ids.push(null);
  }

  return ids;
}

/**
 * Names what a path points at, for a message saying it's the wrong kind.
 * @param path - A parsed path
 * @returns What it names, as a noun phrase
 */
function describePathKind(path: ObjectPath): string {
  if (isNewObjectPath(path)) return NEW_OBJECT_NOUNS[path.kind];

  switch (path.kind) {
    case "scene":
      return "a scene";
    case "slot":
      return "a clip slot";
    case "take-lane":
    case "new-take-lane":
    case "same-take-lane":
      return "a take lane";
    case "device":
      return "a device";
    case "arrangement-position":
      return "an arrangement clip";
    default:
      return "a track";
  }
}
