// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import {
  type InsertionSpot,
  refuseCountWithPathList,
  repeatForCount,
  validateCount,
} from "#src/tools/shared/validation/lists/insertion-plan.ts";
import { parseTimeSignature } from "#src/tools/shared/utils.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { pathError } from "#src/tools/shared/validation/helpers/object-path-lexer.ts";

/**
 * Refuses a set of insert positions that would auto-create too many scenes.
 * @param insertIndexes - Where each new scene is created, in order
 */
export function validateSceneIndexCap(insertIndexes: number[]): void {
  const count = insertIndexes.length;

  if (Math.max(-1, ...insertIndexes) + 1 > MAX_AUTO_CREATED_SCENES) {
    throw new Error(
      `creating ${count} scene${count === 1 ? "" : "s"} at index ${insertIndexes[0]} would exceed the maximum allowed scenes (${MAX_AUTO_CREATED_SCENES})`,
    );
  }
}

/**
 * Pads the live set with empty scenes so index `sceneIndex` exists.
 * @param liveSet - The LiveAPI live_set object
 * @param sceneIndex - The target scene index
 */
export function ensureSceneCountForIndex(
  liveSet: LiveAPI,
  sceneIndex: number,
): void {
  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (sceneIndex > currentSceneCount) {
    const scenesToPad = sceneIndex - currentSceneCount;

    for (let i = 0; i < scenesToPad; i++) {
      liveSet.call("create_scene", -1);
    }
  }
}

/**
 * Applies tempo property to a scene
 * @param scene - The LiveAPI scene object
 * @param tempo - Tempo in BPM (20.0-999.0). -1 disables; other valid values enable
 */
export function applyTempoProperty(
  scene: LiveAPI,
  tempo?: number | null,
): void {
  if (tempo === -1) {
    scene.set("tempo_enabled", false);
  } else if (tempo != null) {
    // Range already refused by validateTempo, before any scene was touched.
    scene.set("tempo", tempo);
    scene.set("tempo_enabled", true);
  }
}

/**
 * Applies time signature property to a scene
 * @param scene - The LiveAPI scene object
 * @param timeSignature - Time signature. "disabled" disables, other values enable
 */
export function applyTimeSignatureProperty(
  scene: LiveAPI,
  timeSignature?: string | null,
): void {
  if (timeSignature === "disabled") {
    scene.set("time_signature_enabled", false);
  } else if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    scene.set("time_signature_numerator", parsed.numerator);
    scene.set("time_signature_denominator", parsed.denominator);
    scene.set("time_signature_enabled", true);
  }
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
  const entries = pathEntries(path, "path");
  const entry = entries[0];

  if (entry == null) {
    return sceneIndex;
  }

  if (sceneIndex != null) {
    throw new Error(
      "path says where the scene goes - don't send sceneIndex with it",
    );
  }

  if (entries.length > 1) {
    throw new Error(
      `capture makes one scene, but path names ${entries.length} places - send one`,
    );
  }

  const spot = sceneSpotFromPath(entry);

  return spot === "end" ? liveSet.getChildIds("scenes").length : spot;
}

/**
 * Reads where the new scenes go, from the path list or the index it replaced.
 * @param path - "s+", "s2", comma-separated for several scenes
 * @param sceneIndex - Deprecated index
 * @param count - Deprecated repeat of a single path
 * @param sceneCount - Scenes in the Set before the call, where "s+" lands
 * @returns One spot per scene to create, in the order the call named them
 */
export function resolveCreateSceneSpots(
  path: string | undefined,
  sceneIndex: number | undefined,
  count: number | undefined,
  sceneCount: number,
): number[] {
  const entries = pathEntries(path, "path");

  if (entries.length === 0) {
    if (sceneIndex == null) {
      throw new Error("path is required");
    }

    validateCount(count);

    return repeatForCount([sceneIndex], count);
  }

  if (sceneIndex != null) {
    throw new Error(
      "path says where the scene goes - don't send sceneIndex with it",
    );
  }

  refuseCountWithPathList(count, entries.length, "scene", "s+,s+");
  validateCount(count);

  return repeatForCount(
    entries.map((entry) => {
      const spot = sceneSpotFromPath(entry);

      return spot === "end" ? sceneCount : spot;
    }),
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
