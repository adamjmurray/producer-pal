// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { executeNoteCode } from "#src/live-api-adapter/code-exec-v8-protocol.ts";
import {
  applyNotesToClip,
  getClipNoteCount,
} from "#src/tools/clip/code-exec/clip-notes-exchange.ts";
import { getClipLocationInfo } from "#src/tools/clip/code-exec/code-execution-context.ts";

/**
 * Execute code on a single clip and apply the resulting notes.
 * Looks up the clip by ID, runs code, applies notes, and returns the new note count.
 *
 * @param clipId - Live API clip ID
 * @param code - User-provided JavaScript code body
 * @param clipIndex - 0-based position in the current batch (for clip.index in user code)
 * @param clipCount - Total clips in the current batch (for clip.count in user code)
 * @returns The updated note count and how many duplicate notes were dropped, the
 *   error the code failed with (the clip is left as it was), or null if the clip
 *   doesn't exist
 */
export async function applyCodeToSingleClip(
  clipId: string,
  code: string,
  clipIndex: number,
  clipCount: number,
): Promise<
  { noteCount: number; droppedDuplicates: number } | { error: string } | null
> {
  const clip = LiveAPI.from(["id", clipId]);

  if (!clip.exists()) {
    return null;
  }

  const location = getClipLocationInfo(clip);
  const result = await executeNoteCode(
    clip,
    code,
    location.view,
    clipIndex,
    clipCount,
    location.sceneIndex,
  );

  if (!result.success) {
    return { error: result.error };
  }

  const droppedDuplicates = applyNotesToClip(clip, result.notes);

  return { noteCount: getClipNoteCount(clip), droppedDuplicates };
}
