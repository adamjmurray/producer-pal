// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { executeNoteCode } from "#src/live-api-adapter/code-exec-v8-protocol.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  applyNotesToClip,
  getClipLocationInfo,
  getClipNoteCount,
} from "#src/tools/clip/code-exec/code-exec-helpers.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * Execute code on a single clip and apply the resulting notes.
 * Looks up the clip by ID, runs code, applies notes, and returns the new note count.
 *
 * @param clipId - Live API clip ID
 * @param code - User-provided JavaScript code body
 * @param clipIndex - 0-based position in the current batch (for clip.index in user code)
 * @param clipCount - Total clips in the current batch (for clip.count in user code)
 * @returns Updated note count, or null if the clip doesn't exist
 */
export async function applyCodeToSingleClip(
  clipId: string,
  code: string,
  clipIndex: number,
  clipCount: number,
): Promise<number | null> {
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

  if (result.success) {
    applyNotesToClip(clip, result.notes);
  } else {
    console.warn(
      `Code execution failed for clip ${targetLabel(clip)}: ${result.error}`,
    );
  }

  return getClipNoteCount(clip);
}
