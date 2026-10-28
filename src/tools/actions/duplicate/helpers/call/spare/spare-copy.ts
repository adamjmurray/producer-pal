// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  holdingAreaStartOnTrack,
  verifyDupResult,
} from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { type LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";

/**
 * Park a full copy of a clip past everything on its track.
 * @param track - The clip's track
 * @param sourceId - The clip to copy
 * @param clearBeats - The furthest beat any copy made from the spare reaches,
 *   which the spare has to sit past
 * @param context - The call's context, which carries its lane view
 * @returns The spare's id
 * @throws Error when Live makes no copy; nothing has changed then
 */
export function makeSpareCopy(
  track: LiveAPI,
  sourceId: string,
  clearBeats: number,
  context: { lanes?: LaneView },
): string {
  const start = holdingAreaStartOnTrack(track, clearBeats, context);

  return verifyDupResult(
    track.call("duplicate_clip_to_arrangement", toLiveApiId(sourceId), start),
    `spare copy of clip ${sourceId} at ${start}`,
  );
}

/**
 * Delete a spare, and check Live did.
 * @param track - The spare's track
 * @param id - The spare's id
 * @returns True when the spare is gone
 */
export function removeSpareCopy(track: LiveAPI, id: string): boolean {
  try {
    track.call("delete_clip", toLiveApiId(id));
  } catch {
    // Whether it is gone is what counts, and that is looked up below.
  }

  // A fresh lookup: the track keeps answering for a clip it just deleted.
  return !LiveAPI.from(toLiveApiId(id)).exists();
}
