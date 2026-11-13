// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  clipLane,
  laneViewOf,
} from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { arrangementSpanOf } from "#src/tools/shared/arrangement/arrangement-clip-resize.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import {
  refuseClipWork,
  type ClipReasons,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import {
  handleArrangementLengthening,
  type ArrangementContext,
  type ClipIdResult,
} from "./arrangement-length-changes.ts";
import { noteLandedShort } from "./unlooped-lengthening.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

/** Why a take-lane clip stopped short of the length asked for. */
const NEXT_CLIP_ON_LANE = "the next clip on the lane starts there";

interface LengthenTakeLaneClipArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentStartTime: number;
  currentEndTime: number;
  context: ArrangementContext;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
}

/**
 * Lengthens a take-lane clip in place, up to the next clip on its lane. A take
 * lane can't be cleared (Live deletes no clip there), so the clip stops at its
 * neighbor and its entry says so.
 * @param args - Lengthen arguments
 * @param args.clip - The take-lane clip
 * @param args.isAudioClip - Whether the clip is audio
 * @param args.arrangementLengthBeats - Target length in beats
 * @param args.currentStartTime - Where the clip starts, in beats
 * @param args.currentEndTime - Where it ends now, in beats
 * @param args.context - Per-request context
 * @param args.reasons - What each clip has to say beyond its result
 * @returns The clip, when it grew
 */
export function lengthenTakeLaneClip(
  args: LengthenTakeLaneClipArgs,
): ClipIdResult[] {
  const { clip, arrangementLengthBeats: asked, reasons } = args;
  const start = args.currentStartTime;
  const end = args.currentEndTime;
  const lanes = laneViewOf(args.context);
  const nextStart = Math.min(
    Infinity,
    ...lanes
      .overlapping(clipLane(clip) as ArrangementLane, end, start + asked)
      .filter(({ id }) => id !== clip.id)
      .map((next) => next.start),
  );

  if (nextStart <= end + SAME_TIME_EPSILON) {
    refuseClipWork(
      reasons,
      clip.id,
      "arrangementLength unchanged: the next clip on the lane starts where this one ends",
    );

    return [];
  }

  const target = Math.min(asked, nextStart - start);

  lanes.clipChanged(clip);

  const grown = handleArrangementLengthening({
    ...args,
    arrangementLengthBeats: target,
    currentArrangementLength: end - start,
  });

  // A clip that stopped sooner already said why (Live, or its audio file).
  if (
    grown.length > 0 &&
    target < asked - SAME_TIME_EPSILON &&
    arrangementSpanOf(clip) >= target - SAME_TIME_EPSILON
  ) {
    noteLandedShort(reasons, clip.id, target, NEXT_CLIP_ON_LANE);
  }

  return grown;
}
