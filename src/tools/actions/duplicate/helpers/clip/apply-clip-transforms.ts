// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { appendReason } from "#src/tools/shared/helpers/entry-reasons.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { type MinimalClipInfo } from "../minimal-clip-info.ts";
import { collectClipResults } from "./overwritten-copies.ts";

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

  if (clipResults.length === 0) {
    return;
  }

  const ids = clipResults.map((clip) => clip.id).join(",");
  const updated = await updateCopies(ids, transforms, code, context);

  if (!Array.isArray(updated)) {
    // The copies are made and reported; only the edit didn't run, so each one
    // carries the reason rather than the whole duplicate failing. Appended, so
    // a copy that replaced a clip still says so.
    for (const clip of clipResults) {
      appendReason(clip, updated);
    }

    return;
  }

  const statsById = new Map(
    updated.map((result) => [
      (result as MinimalClipInfo).id,
      result as MinimalClipInfo,
    ]),
  );

  for (const clip of clipResults) {
    const stats = statsById.get(clip.id);

    if (stats?.noteCount != null) {
      clip.noteCount = stats.noteCount;
    }

    if (stats?.transformed != null) {
      clip.transformed = stats.transformed;
    }

    // A copy the update couldn't edit has a reason of its own to carry.
    if (stats?.reason != null) {
      appendReason(clip, stats.reason);
    }
  }
}

/**
 * Run the edit over the copies, putting a refusal on their entries instead of
 * letting it escape.
 *
 * A lone copy whose update can't be done throws rather than answering with an
 * entry, and that throw would lose the copies this call already made.
 * @param ids - The copies to edit
 * @param transforms - Transform expressions, if any
 * @param code - Code to run, if any
 * @param context - Tool execution context
 * @returns One entry per copy, or the reason none could be edited
 */
async function updateCopies(
  ids: string,
  transforms: string | undefined,
  code: string | undefined,
  context: Partial<ToolContext>,
): Promise<object[] | string> {
  try {
    const result = await updateClip({ ids, transforms, code }, context);

    return Array.isArray(result) ? result : [result];
  } catch (error) {
    return `the copy was made, but the edit wasn't: ${errorMessage(error)}`;
  }
}
