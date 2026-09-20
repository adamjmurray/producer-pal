// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  arrangementWriteEffects,
  snapshotLane,
} from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import {
  noteClipReason,
  refuseClipWork,
  type ClipReasons,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import {
  handleArrangementLengthening,
  handleArrangementShortening,
  type ArrangementContext,
  type ClipIdResult,
} from "./helpers/arrangement-length-changes.ts";

interface HandleArrangementLengthOperationArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  context: ArrangementContext;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
}

/**
 * Handle arrangement length changes (lengthening via tiling/exposure or shortening)
 * @param args - Operation arguments
 * @param args.clip - The LiveAPI clip object
 * @param args.isAudioClip - Whether the clip is an audio clip
 * @param args.arrangementLengthBeats - Target length in beats
 * @param args.context - Tool execution context
 * @param args.reasons - What each clip has to say beyond its result
 * @returns Array of clip result objects to add to updatedClips
 */
export function handleArrangementLengthOperation({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  context,
  reasons,
}: HandleArrangementLengthOperationArgs): ClipIdResult[] {
  const updatedClips: ClipIdResult[] = [];
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (!isArrangementClip) {
    refuseClipWork(
      reasons,
      clip.id,
      "arrangementLength ignored: this is a session clip",
    );

    return updatedClips;
  }

  // The lengthening path uses duplicate_clip_to_arrangement (Track-only) and
  // the shortening path uses a temp clip overlay that targets the main lane, so
  // neither works on take-lane clips. The clip's own entry says so.
  if (isTakeLaneClip(clip)) {
    refuseClipWork(
      reasons,
      clip.id,
      "arrangementLength ignored for a take-lane clip; adjust it in Live's UI",
    );

    return updatedClips;
  }

  // Get current clip dimensions
  const currentStartTime = clip.getProperty("start_time") as number;
  const currentEndTime = clip.getProperty("end_time") as number;
  const currentArrangementLength = currentEndTime - currentStartTime;

  // Check if shortening, lengthening, or same
  if (arrangementLengthBeats > currentArrangementLength) {
    // Growing into the lane overwrites whatever sits after the clip, so
    // photograph the lane first and say what the growth cost.
    const laneBefore = snapshotLane({
      kind: "track",
      trackIndex: clip.trackIndex as number,
    });
    const result = handleArrangementLengthening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentStartTime,
      currentEndTime,
      context,
      reasons,
    });
    // The clip itself and every tile it laid describe themselves.
    const displaced = arrangementWriteEffects(laneBefore, [
      clip.id,
      ...result.map(({ id }) => id),
    ]);

    if (displaced != null) {
      noteClipReason(reasons, clip.id, displaced);
    }

    updatedClips.push(...result);
  } else if (arrangementLengthBeats < currentArrangementLength) {
    // Shortening: Use temp clip overlay pattern
    handleArrangementShortening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentStartTime,
      currentEndTime,
      context,
    });
  }

  return updatedClips;
}
