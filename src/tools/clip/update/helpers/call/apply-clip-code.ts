// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import { droppedDuplicatesNote } from "#src/tools/clip/helpers/clip-entry-notes.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  type ClipReasons,
  ignoreClipParams,
  noteClipReason,
} from "../entries/clip-reasons.ts";
import { reportMutedCodeWrite } from "../notes/muted-note-effects.ts";

/**
 * Run the call's `code` on the clips an update just wrote, and say how it went
 * on the clip's own entry.
 * @param updatedClips - The clips the update wrote, the first being the target's
 * @param reasons - What each clip has to say beyond its result, added to
 * @param sourceId - The clip the call named: a failure is filed under it, since
 *   a re-created clip has a new id and the entry is settled by the original
 * @param position - The target's place in the call (for clip.index in user code)
 * @param count - How many targets the call named (for clip.count in user code)
 * @param code - JavaScript code to execute
 */
export async function applyCodeToWrittenClips(
  updatedClips: ClipResult[],
  reasons: ClipReasons,
  sourceId: string,
  position: number,
  count: number,
  code?: string,
): Promise<void> {
  if (code == null) {
    return;
  }

  for (const clipResult of updatedClips) {
    const applied = await applyCodeToSingleClip(
      clipResult.id,
      code,
      position,
      count,
    );

    if (applied != null && "error" in applied) {
      const reason = `code failed: ${applied.error}`;

      // Tiled copies run the same code and fail the same way: say it once.
      if (!reasons.said.get(sourceId)?.includes(reason)) {
        ignoreClipParams(reasons, sourceId, ["code"], reason);
      }
    } else if (applied != null) {
      clipResult.noteCount = applied.noteCount;

      const dropped = droppedDuplicatesNote(applied.droppedDuplicates);

      // Tiled copies run the same code: say it once, like a failure
      if (dropped != null && !reasons.said.get(sourceId)?.includes(dropped)) {
        noteClipReason(reasons, sourceId, dropped);
      }

      // Muted notes are the first clip's to report: its copies carry the same
      // ones, and counting them again would multiply what the code did.
      if (clipResult === updatedClips[0]) {
        reportMutedCodeWrite(
          LiveAPI.from(["id", clipResult.id]),
          reasons,
          sourceId,
          applied.applied,
        );
      }
    }
  }
}
