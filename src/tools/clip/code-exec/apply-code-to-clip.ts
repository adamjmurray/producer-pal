// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { executeNoteCode } from "#src/live-api-adapter/code-exec-v8-protocol.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  applyNotesToClip,
  getClipLocationInfo,
  getClipNoteCount,
} from "#src/tools/clip/code-exec/code-exec-helpers.ts";

/**
 * Execute code on a single clip and apply the resulting notes.
 * Looks up the clip by ID, runs code, applies notes, and returns the new note count.
 *
 * @param clipId - Live API clip ID
 * @param code - User-provided JavaScript code body
 * @returns Updated note count, or null if the clip doesn't exist
 */
export async function applyCodeToSingleClip(
  clipId: string,
  code: string,
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
    location.sceneIndex,
    location.arrangementStartBeats,
  );

  if (result.success) {
    applyNotesToClip(clip, result.notes);
  } else {
    console.warn(`Code execution failed for clip ${clipId}: ${result.error}`);
  }

  return getClipNoteCount(clip);
}
