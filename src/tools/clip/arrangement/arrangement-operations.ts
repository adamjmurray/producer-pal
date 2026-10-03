// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import { laneViewOf } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import {
  markClipLanded,
  noteClipReason,
  noteLanded,
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
    // Growing into the lane overwrites whatever sits after the clip, so note
    // the lane first and say what the growth cost. This clip's ledger starts
    // here, from the call's lane view, so it hears of nothing before it.
    const lane: ArrangementLane = {
      kind: "track",
      trackIndex: clip.trackIndex as number,
    };
    const ledger = new LaneLedger({ lanes: laneViewOf(context) });

    ledger.scan(lane);

    let result: ClipIdResult[];

    try {
      result = handleArrangementLengthening({
        clip,
        isAudioClip,
        arrangementLengthBeats,
        currentArrangementLength,
        currentStartTime,
        currentEndTime,
        context,
        reasons,
      });
    } catch (error) {
      // The clip may already have grown over its neighbours (the region is set
      // in steps), and nothing will read the lane back, so the view forgets it.
      ledger.forget(lane);
      throw error;
    }

    // The clip itself and every tile it laid describe themselves. Tiling clears
    // ahead of what lands, so everything up to the target counts as written.
    const displaced = ledger.afterWrite(
      lane,
      [clip.id, ...result.map(({ id }) => id)],
      {
        reach: {
          start: currentStartTime,
          end: currentStartTime + arrangementLengthBeats,
        },
      },
    );

    if (displaced != null) {
      noteClipReason(reasons, clip.id, displaced);
    }

    updatedClips.push(...result);
  } else if (
    shortensArrangementClip(
      currentStartTime,
      currentEndTime,
      arrangementLengthBeats,
    )
  ) {
    // Shortening: Use temp clip overlay pattern
    handleArrangementShortening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentStartTime,
      currentEndTime,
      context,
      // A scratch clip Live won't remove is this clip's to report.
      reportScratch: (message) => noteClipReason(reasons, clip.id, message),
    });
    // The clip was cut in place, so it is updated, not a clip left as it was.
    markClipLanded(reasons, clip.id);
    noteLanded(reasons, "shortened", { id: clip.id });
  }

  return updatedClips;
}

/**
 * Whether an arrangementLength shortens a clip's arrangement span.
 * @param startTime - The clip's start_time, in beats
 * @param endTime - The clip's end_time, in beats
 * @param arrangementLengthBeats - Target length in beats
 * @returns True when the target is shorter than the clip is now
 */
export function shortensArrangementClip(
  startTime: number,
  endTime: number,
  arrangementLengthBeats: number,
): boolean {
  return arrangementLengthBeats < endTime - startTime;
}
