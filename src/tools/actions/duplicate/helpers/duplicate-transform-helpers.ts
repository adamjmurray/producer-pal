// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  getCycledEntry,
  warnExtraEntries,
} from "#src/tools/shared/validation/cycle-utils.ts";
import { type MinimalClipInfo } from "./duplicate-helpers.ts";

interface NestedClipResult {
  trackIndex: number;
  clips: MinimalClipInfo[];
}

/**
 * Apply transforms and/or code to the clips produced by a duplicate operation.
 *
 * Delegates to updateClip so the duplicated clips reuse the exact transform DSL
 * and code-exec behavior as ppal-update-clip. transforms/code are arrays cycled
 * across the logical duplicates (one entry per copy/position, cycling via modulo
 * when there are more copies than entries). The rotated entries are flattened
 * into per-id arrays aligned with updateClip's ids and passed in a SINGLE call,
 * so clip.index/clip.count still span the whole batch (keeping seq(...) intact)
 * while each copy gets its own transform/code. Resulting noteCount and
 * transformed counts are merged back into the duplicate result objects.
 *
 * @param createdObjects - Result objects from clip duplication (mutated in place)
 * @param transforms - Transform expressions per duplicate, cycled (optional)
 * @param code - JavaScript function bodies per duplicate, cycled (optional)
 * @param context - Tool execution context (holding area, timeout, etc.)
 */
export async function applyTransformsToDuplicatedClips(
  createdObjects: object[],
  transforms: string[] | undefined,
  code: string[] | undefined,
  context: Partial<ToolContext>,
): Promise<void> {
  const clipGroups = collectClipGroups(createdObjects);
  const clipResults = clipGroups.flat();

  if (clipResults.length === 0) return;

  warnExtraEntries(transforms, clipGroups.length, "duplicate", "transforms");
  warnExtraEntries(code, clipGroups.length, "duplicate", "code");

  const ids = clipResults.map((clip) => clip.id).join(",");
  const perIdTransforms = buildPerIdEntries(clipGroups, transforms);
  const perIdCode = buildPerIdEntries(clipGroups, code);

  const updateResult = await updateClip(
    { ids, transforms: perIdTransforms, code: perIdCode },
    context,
  );
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
 * Group duplicate result objects by logical duplicate (one group per copy).
 *
 * Arrangement tiling (arrangementLength) nests multiple clips under
 * { trackIndex, clips } — all those clips belong to the same logical duplicate
 * and share one transform entry. Other duplications return one clip per copy.
 *
 * @param createdObjects - Result objects from clip duplication
 * @returns List of clip-result groups, one per logical duplicate
 */
function collectClipGroups(createdObjects: object[]): MinimalClipInfo[][] {
  const groups: MinimalClipInfo[][] = [];

  for (const obj of createdObjects) {
    if ("clips" in obj) {
      groups.push((obj as NestedClipResult).clips);
    } else if ("id" in obj) {
      groups.push([obj as MinimalClipInfo]);
    }
  }

  return groups;
}

/**
 * Build a per-id entry array aligned with the flattened clip ids by cycling the
 * user's list across logical duplicates and repeating each entry for every clip
 * within that duplicate's group.
 *
 * @param clipGroups - Clip results grouped by logical duplicate
 * @param list - User-provided per-duplicate entries (optional)
 * @returns Per-id array aligned with the flattened clips, or undefined
 */
function buildPerIdEntries(
  clipGroups: MinimalClipInfo[][],
  list: string[] | undefined,
): string[] | undefined {
  if (list == null || list.length === 0) return;

  const perId: string[] = [];

  for (let d = 0; d < clipGroups.length; d++) {
    const entry = getCycledEntry(list, d) as string;
    const group = clipGroups[d] as MinimalClipInfo[];

    for (let c = 0; c < group.length; c++) {
      perId.push(entry);
    }
  }

  return perId;
}
