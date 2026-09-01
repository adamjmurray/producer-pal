// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Addressing tracks and scenes by where they are instead of by id, so a caller
// that just read a Set can act on what it found without carrying ids around.
//
// A path that names the wrong kind of thing, or nothing at all, warns and
// contributes nothing — the same as an id that doesn't resolve, so one bad
// entry costs its own object rather than the whole batch. A hole in the list
// itself ("t0,,t1") is different: nothing can line up against a list whose
// length is a guess, so it throws before anything runs, like a hole in `id`.

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  pathEntries,
  trackSegmentPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  parseObjectPath,
  pathError,
  type ObjectPath,
} from "#src/tools/shared/validation/object-path.ts";

/**
 * Resolves track path(s) to the ids of the tracks they name.
 * @param paths - Comma-separated track paths (e.g. "t0,rt1,mt")
 * @param tool - Tool name, for warnings
 * @param label - Param name the paths came from, for warnings
 * @returns One track id per path entry, null where a path named none
 */
export function trackIdPerPath(
  paths: string,
  tool: string,
  label = "path",
): Array<string | null> {
  return idPerPath(paths, tool, label, (path, entry) => {
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
  });
}

/**
 * Resolves scene path(s) to the ids of the scenes they name.
 * @param paths - Comma-separated scene paths (e.g. "s0,s3")
 * @param tool - Tool name, for warnings
 * @param label - Param name the paths came from, for warnings
 * @returns One scene id per path entry, null where a path named none
 */
export function sceneIdPerPath(
  paths: string,
  tool: string,
  label = "path",
): Array<string | null> {
  return idPerPath(paths, tool, label, (path, entry) => {
    if (path.kind !== "scene") {
      throw pathError(
        label,
        entry,
        `names ${describePathKind(path)}, not a scene; expected "s<index>"`,
      );
    }

    return LiveAPI.from(livePath.scene(path.sceneIndex));
  });
}

// --- Helpers below main exports ---

/**
 * Resolves each entry through a type-specific lookup, keeping one slot per
 * path so a caller pairing paths against another list keeps its positions.
 * @param paths - The raw path param
 * @param tool - Tool name, for warnings
 * @param label - Param name the paths came from, for warnings
 * @param resolve - Turns a parsed path into the object it names, or throws
 * @returns One id per path entry, null where a path named none
 */
function idPerPath(
  paths: string,
  tool: string,
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

      console.warn(`${tool}: nothing at ${label} "${entry}"`);
    } catch (error) {
      console.warn(`${tool}: ${errorMessage(error)}`);
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
  switch (path.kind) {
    case "scene":
      return "a scene";
    case "slot":
      return "a clip slot";
    case "take-lane":
    case "new-take-lane":
      return "a take lane";
    case "device":
      return "a device";
    default:
      return "a track";
  }
}
