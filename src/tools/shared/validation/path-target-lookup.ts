// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Addressing tracks and scenes by where they are instead of by id, so a caller
// that just read a Set can act on what it found without carrying ids around.
//
// A lookup reports a miss rather than raising it: on a tool taking a list the
// miss becomes that target's result entry. A read naming one object has nothing
// left to return, so it throws instead.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  existingId,
  type IdLookup,
} from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import { trackSegmentPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  isNewObjectPath,
  NEW_OBJECT_NOUNS,
  parseObjectPath,
  type ObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import { pathError } from "#src/tools/shared/validation/helpers/object-path-lexer.ts";

/**
 * The id of the track one path names, or the reason it names none.
 * @param entry - One track path (e.g. "t0", "rt1", "mt")
 * @param label - Param name the path came from, for the reason
 * @returns The track's id, or why there isn't one
 */
export function trackIdAtPath(entry: string, label = "path"): IdLookup {
  return existingId(trackAtPath(parseObjectPath(entry, label), entry, label), {
    noun: "track",
    label,
    entry,
  });
}

/**
 * The id of the scene one path names, or the reason it names none.
 * @param entry - One scene path (e.g. "s3")
 * @param label - Param name the path came from, for the reason
 * @returns The scene's id, or why there isn't one
 */
export function sceneIdAtPath(entry: string, label = "path"): IdLookup {
  return existingId(sceneAtPath(parseObjectPath(entry, label), entry, label), {
    noun: "scene",
    label,
    entry,
  });
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
 * Names what a path points at, for a message saying it's the wrong kind.
 * @param path - A parsed path
 * @returns What it names, as a noun phrase
 */
function describePathKind(path: ObjectPath): string {
  if (isNewObjectPath(path)) {
    return NEW_OBJECT_NOUNS[path.kind];
  }

  switch (path.kind) {
    case "scene":
      return "a scene";
    case "slot":
      return "a clip slot";
    case "take-lane":
      return "a take lane";
    case "device":
      return "a device";
    case "arrangement-position":
      return "an arrangement clip";
    default:
      return "a track";
  }
}
