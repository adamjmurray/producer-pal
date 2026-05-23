// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { type MinimalClipInfo } from "./duplicate-helpers.ts";

interface NestedClipResult {
  trackIndex: number;
  clips: MinimalClipInfo[];
}

/**
 * Apply transforms and/or code to the clips produced by a duplicate operation.
 *
 * Delegates to updateClip so the duplicated clips reuse the exact transform DSL
 * and code-exec behavior as ppal-update-clip. Transforms apply per-clip: passing
 * all duplicated clip IDs in one call exposes clip.index/clip.count across the
 * batch, enabling variations (e.g. seq(...) per duplicate). Resulting noteCount
 * and transformed counts are merged back into the duplicate result objects.
 *
 * @param createdObjects - Result objects from clip duplication (mutated in place)
 * @param transforms - Transform expressions to apply (optional)
 * @param code - JavaScript function body to apply (optional)
 * @param context - Tool execution context (holding area, timeout, etc.)
 */
export async function applyTransformsToDuplicatedClips(
  createdObjects: object[],
  transforms: string | undefined,
  code: string | undefined,
  context: Partial<ToolContext>,
): Promise<void> {
  const clipResults = collectClipResults(createdObjects);

  if (clipResults.length === 0) return;

  const ids = clipResults.map((clip) => clip.id).join(",");
  const updateResult = await updateClip({ ids, transforms, code }, context);
  const updated = Array.isArray(updateResult) ? updateResult : [updateResult];

  const statsById = new Map(
    updated.map((result) => [
      (result as MinimalClipInfo).id,
      result as MinimalClipInfo,
    ]),
  );

  for (const clip of clipResults) {
    const stats = statsById.get(clip.id);

    if (stats?.noteCount != null) clip.noteCount = stats.noteCount;
    if (stats?.transformed != null) clip.transformed = stats.transformed;
  }
}

/**
 * Flatten duplicate result objects into a list of clip result objects.
 *
 * Arrangement tiling (arrangementLength) nests multiple clips under
 * { trackIndex, clips }, while other duplications return clips directly.
 *
 * @param createdObjects - Result objects from clip duplication
 * @returns Flat list of clip result objects with an id field
 */
function collectClipResults(createdObjects: object[]): MinimalClipInfo[] {
  const results: MinimalClipInfo[] = [];

  for (const obj of createdObjects) {
    if ("clips" in obj) {
      results.push(...(obj as NestedClipResult).clips);
    } else if ("id" in obj) {
      results.push(obj as MinimalClipInfo);
    }
  }

  return results;
}
