// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { type MinimalClipInfo } from "../duplicate-helpers.ts";
import { collectClipResults } from "./duplicate-overwrite-helpers.ts";

/**
 * Apply transforms and/or code to the clips produced by a duplicate operation.
 *
 * Delegates to updateClip so the duplicated clips reuse the exact transform DSL
 * and code-exec behavior as ppal-update-clip. transforms/code are single strings
 * broadcast across every duplicated clip — per-copy variation is expressed with
 * clip.index arithmetic and clipseq() inside the string. The
 * single updateClip call also keeps clip.index/clip.count spanning the whole
 * batch. Resulting noteCount and transformed counts are merged back into the
 * duplicate result objects.
 *
 * @param createdObjects - Result objects from clip duplication (mutated in place)
 * @param transforms - Transform expressions broadcast across all copies (optional)
 * @param code - JavaScript function body broadcast across all copies (optional)
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
