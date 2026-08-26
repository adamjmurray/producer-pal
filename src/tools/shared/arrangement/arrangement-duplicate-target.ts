// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Crash-safe + self-overlap-safe arrangement clip duplication. Wraps the
 * Ableton crash workaround so callers get a single "place a copy at a target
 * arrangement position" primitive.
 */

import { toLiveApiId } from "#src/tools/shared/utils.ts";
import { type TilingContext } from "./helpers/arrangement-tiling-helpers.ts";
import {
  clearClipAtDuplicateTarget,
  duplicateSelfOverlappingClip,
} from "./arrangement-tiling-workaround.ts";

/**
 * Duplicate a clip to a target arrangement position. Clears any other clips
 * overlapping the target (Ableton crash workaround); when the source overlaps
 * its OWN target it is routed through the holding area so the original is
 * overwritten and a full copy lands at the target (instead of skipping).
 * @param track - LiveAPI track instance
 * @param sourceClipId - ID of the clip to duplicate
 * @param targetBeats - Target position in Ableton beats
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Tiling context with silenceWavPath for audio operations
 * @returns The placed clip (may be a phantom on silent failure — check exists())
 */
export function duplicateToArrangementTarget(
  track: LiveAPI,
  sourceClipId: string,
  targetBeats: number,
  isMidiClip: boolean,
  context: TilingContext,
): LiveAPI {
  const safe = clearClipAtDuplicateTarget(
    track,
    sourceClipId,
    targetBeats,
    isMidiClip,
    context,
  );

  if (!safe) {
    return duplicateSelfOverlappingClip(
      track,
      sourceClipId,
      targetBeats,
      isMidiClip,
      context,
    );
  }

  return LiveAPI.from(
    track.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sourceClipId),
      targetBeats,
    ) as [string, string | number],
  );
}
