// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { withCreatedScenes } from "#src/tools/shared/clip/create-missing-scenes.ts";
import { createdRange } from "#src/tools/shared/helpers/created-range.ts";
import {
  type InsertionSpot,
  refuseCountWithPathList,
  repeatForCount,
  validateCount,
} from "#src/tools/shared/validation/lists/insertion-plan.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  formatObjectPath,
  parseObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import { pathError } from "#src/tools/shared/validation/helpers/object-path-lexer.ts";
import { refuseNamedTwice } from "#src/tools/shared/helpers/param-presence.ts";

/**
 * Refuses new scenes that would reach past the scene cap.
 * @param sceneIndexes - Where each new scene ends up, in order
 * @param count - How many scenes the call creates
 */
export function validateSceneIndexCap(
  sceneIndexes: number[],
  count = sceneIndexes.length,
): void {
  if (Math.max(-1, ...sceneIndexes) + 1 > MAX_AUTO_CREATED_SCENES) {
    throw new Error(
      `creating ${count} scene${count === 1 ? "" : "s"} at index ${sceneIndexes[0]} would exceed the maximum allowed scenes (${MAX_AUTO_CREATED_SCENES})`,
    );
  }
}

/**
 * Appends empty scenes. A failure part-way names the ones already made: they
 * stay in the Set though nothing landed.
 * @param liveSet - The LiveAPI live_set object
 * @param count - How many to add
 * @param current - How many scenes there are, when the caller has read it
 * @returns The scenes made ("s8-s9"), or null when none were needed
 * @throws Error when Live refuses one, naming the scenes made before it
 */
export function padScenes(
  liveSet: LiveAPI,
  count: number,
  current?: number,
): string | null {
  if (count <= 0) {
    return null;
  }

  const first = current ?? liveSet.getChildIds("scenes").length;
  let made = 0;

  try {
    for (; made < count; made++) {
      liveSet.call("create_scene", -1);
    }
  } catch (error) {
    throw new Error(
      withCreatedScenes(
        errorMessage(error),
        made === 0 ? null : createdRange("s", first, first + made - 1),
      ),
      { cause: error },
    );
  }

  return createdRange("s", first, first + count - 1);
}

/**
 * Names empty scenes a failed insert left, where they sit now.
 * @param left - The ids of the scenes it made
 * @param all - The ids of every scene in the Set, in order
 * @returns The scenes as paths ("s2-s3, s6"), or null when none are there
 */
export function leftScenesAt(left: string[], all: string[]): string | null {
  const indexes = all
    .flatMap((id, index) => (left.includes(id) ? [index] : []))
    .toSorted((a, b) => a - b);
  const ranges: string[] = [];
  let first = 0;

  for (let i = 0; i < indexes.length; i++) {
    const last = indexes[i] as number;

    if (i === 0) {
      first = last;
    }

    if (indexes[i + 1] !== last + 1) {
      ranges.push(createdRange("s", first, last));
      first = indexes[i + 1] ?? 0;
    }
  }

  return ranges.length === 0 ? null : ranges.join(", ");
}

/**
 * Pads the live set with empty scenes so index `sceneIndex` exists.
 * @param liveSet - The LiveAPI live_set object
 * @param sceneIndex - The target scene index
 * @returns The scenes this made ("s8-s9"), or null when none were needed
 */
export function ensureSceneCountForIndex(
  liveSet: LiveAPI,
  sceneIndex: number,
): string | null {
  const current = liveSet.getChildIds("scenes").length;

  return padScenes(liveSet, sceneIndex - current, current);
}

/**
 * What a scene is called, the way Live shows it: its name, or its 1-based
 * number when it has none.
 * @param scene - The LiveAPI scene object
 * @param sceneIndex - The scene's 0-based index
 * @returns The scene's name, or its number when unnamed
 */
export function sceneDisplayName(scene: LiveAPI, sceneIndex: number): string {
  const name = scene.getName();

  return name === "" ? `${sceneIndex + 1}` : name;
}

/**
 * Reads where the one captured scene goes, from a path or the index it
 * replaced. Capture makes a single scene, so it takes a single path.
 * @param path - "s+" to append, "s2" to insert at 2
 * @param sceneIndex - Deprecated index
 * @param liveSet - Live set, read only to append
 * @returns The index to insert at, or undefined when neither was given
 */
export function resolveCreateSceneIndex(
  path: string | undefined,
  sceneIndex: number | undefined,
  liveSet: LiveAPI,
): number | undefined {
  refuseNamedTwice({
    param: "path",
    value: path,
    noun: "destination",
    also: { sceneIndex },
  });

  const entries = pathEntries(path, "path");
  const entry = entries[0];

  if (entry == null) {
    return sceneIndex;
  }

  if (entries.length > 1) {
    throw new Error(
      `capture makes one scene, but path names ${entries.length} places - send one`,
    );
  }

  const spot = sceneSpotFromPath(entry);

  return spot === "end" ? liveSet.getChildIds("scenes").length : spot;
}

/** Where one new scene goes, and how a skip entry names the place. */
export interface SceneSpot {
  spot: InsertionSpot;
  /** The place as a path: the caller's spelling, or what the retired params
   * stand for */
  spelled: string;
}

/**
 * Reads where the new scenes go, from the path list or the index it replaced.
 * @param path - "s+", "s2", comma-separated for several scenes
 * @param sceneIndex - Deprecated index
 * @param count - Deprecated repeat of a single path
 * @returns One spot per scene to create, in the order the call named them
 */
export function resolveCreateSceneSpots(
  path: string | undefined,
  sceneIndex: number | undefined,
  count: number | undefined,
): SceneSpot[] {
  refuseNamedTwice({
    param: "path",
    value: path,
    noun: "destination",
    also: { sceneIndex },
  });

  const entries = pathEntries(path, "path");

  if (entries.length === 0) {
    if (sceneIndex == null) {
      throw new Error("path is required");
    }

    validateCount(count);

    return repeatForCount(
      [
        {
          spot: sceneIndex,
          spelled: formatObjectPath({ kind: "scene", sceneIndex }),
        },
      ],
      count,
    );
  }

  refuseCountWithPathList(count, entries.length, "scene", "s+,s+");
  validateCount(count);

  return repeatForCount(
    entries.map((entry) => ({
      spot: sceneSpotFromPath(entry),
      spelled: entry,
    })),
    count,
  );
}

// --- Helpers below main exports ---

/**
 * Reads one path as a place to put a new scene.
 * @param entry - The path as written
 * @returns The index to insert at, or "end" to append
 */
function sceneSpotFromPath(entry: string): InsertionSpot {
  const parsed = parseObjectPath(entry, "path");

  if (parsed.kind === "new-scene") {
    return "end";
  }

  if (parsed.kind === "scene") {
    return parsed.sceneIndex;
  }

  throw pathError(
    "path",
    entry,
    'it names no place for a scene; expected "s+" or "s<index>"',
  );
}
