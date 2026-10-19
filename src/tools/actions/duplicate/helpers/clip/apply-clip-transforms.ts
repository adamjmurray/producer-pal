// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { refuseNoteEditsByMeter } from "#src/tools/clip/update/helpers/notes/note-edit-parsing.ts";
import { getTimeSignature } from "#src/tools/clip/update/helpers/clip-beat-positions.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { type ClipNumbering } from "#src/tools/clip/update/helpers/call/plan-clip-moves.ts";
import { type MinimalClipInfo } from "../minimal-clip-info.ts";
import { collectClipResults } from "./overwrites/overwritten-copies.ts";

/**
 * Refuse transforms the copies can't read, before any copy is made: one onto an
 * arrangement clip replaces it. A copy keeps its source's meter, and a
 * transform's time range depends on it, so each source is read in its own. Audio sources are read as audio clips are.
 * @param type - What the call duplicates; only clips take transforms
 * @param sources - The sources, in call order
 * @param transforms - Transform expressions, if sent
 */
export function refuseUnreadableCopyTransforms(
  type: string,
  sources: Array<{ id: string }>,
  transforms: string | undefined,
): void {
  if (type !== "clip" || !transforms?.trim()) {
    return;
  }

  const clips = sources
    .map((source) => LiveAPI.from(source.id))
    .filter((clip) => clip.exists());

  refuseNoteEditsByMeter(
    clips,
    { transformString: transforms, context: {} },
    (clip) => getTimeSignature(undefined, clip),
    () => true,
  );
}

/**
 * Apply transforms and/or code to the clips produced by a duplicate operation.
 *
 * Delegates to updateClip so the duplicated clips reuse the exact transform DSL
 * and code-exec behavior as ppal-update-clip. transforms/code are single strings
 * broadcast across every duplicated clip — per-copy variation is expressed with
 * clip.index arithmetic and clipseq() inside the string. clip.index numbers the
 * copies, so every tile of a copy gets its copy's number, and clip.count is the
 * number of copies, skipped ones included. Resulting noteCount, transformed and
 * deletedNotes counts are merged back into the duplicate result objects.
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
  const collected = collectClipResults(createdObjects);
  const clipResults = collected.map(({ entry }) => entry);

  if (clipResults.length === 0) {
    return;
  }

  const ids = clipResults.map((clip) => clip.id).join(",");
  // Numbered by copy, as name is: a copy that made no clip still takes one.
  const numbering = {
    indexes: collected.map(({ copy }) => copy),
    count: createdObjects.length,
  };
  const updated = await updateCopies(
    ids,
    numbering,
    { transforms, code },
    context,
  );

  if (!Array.isArray(updated)) {
    // The copies are made and reported; only the edit didn't run, so each one
    // carries the reason rather than the whole duplicate failing. Appended, so
    // a copy that replaced a clip still says so.
    for (const clip of clipResults) {
      appendDetail(clip, updated);
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

    if (stats?.deletedNotes != null) {
      clip.deletedNotes = stats.deletedNotes;
    }

    // A copy the update couldn't edit has a detail of its own to carry.
    if (stats?.detail != null) {
      appendDetail(clip, stats.detail);
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
 * @param numbering - Each clip's clip.index, and clip.count
 * @param edit - The edit to run
 * @param edit.transforms - Transform expressions, if any
 * @param edit.code - Code to run, if any
 * @param context - Tool execution context
 * @returns One entry per copy, or the reason none could be edited
 */
async function updateCopies(
  ids: string,
  numbering: ClipNumbering,
  { transforms, code }: { transforms?: string; code?: string },
  context: Partial<ToolContext>,
): Promise<object[] | string> {
  try {
    const result = await updateClip(
      { ids, transforms, code },
      context,
      numbering,
    );

    return Array.isArray(result) ? result : [result];
  } catch (error) {
    return `the copy was made, but the edit wasn't: ${errorMessage(error)}`;
  }
}
