// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import { droppedDuplicatesNote } from "#src/tools/clip/helpers/clip-entry-notes.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { type ClipResultObject } from "./created-clip-result.ts";

/**
 * Run the call's code on a clip just created, putting what came of it on the
 * clip's own entry: the new note count, a failure, or dropped duplicate notes.
 * @param clipResult - The created clip's entry
 * @param code - The code to run
 * @param index - The clip's place in the whole create call
 * @param count - How many clips the call creates
 */
export async function applyCodeToCreatedClip(
  clipResult: ClipResultObject,
  code: string,
  index: number,
  count: number,
): Promise<void> {
  const applied = await applyCodeToSingleClip(
    clipResult.id,
    code,
    index,
    count,
  );

  if (applied == null) {
    return;
  }

  if ("error" in applied) {
    appendDetail(clipResult, `code failed: ${applied.error}`);

    return;
  }

  clipResult.noteCount = applied.noteCount;

  const dropped = droppedDuplicatesNote(applied.droppedDuplicates);

  if (dropped != null) {
    appendDetail(clipResult, dropped);
  }
}
