// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { startSplitting } from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  clipReporterFor,
  markClipLanded,
  noteLanded,
  refuseClipWork,
} from "../entries/clip-reasons.ts";
import { type ClipRun } from "./clip-run.ts";
import { type SplitRequest } from "./parse-clip-call.ts";
import { SESSION_CLIP, ignoredText } from "#src/shared/max/ignored-wording.ts";

/**
 * Why a clip can't be cut, or null when it can.
 *
 * The cut uses duplicate_clip_to_arrangement, which is Track-only and can't
 * target take lanes: the clip's own entry says it wasn't cut, rather than the
 * split silently landing on the main lane.
 * @param clip - The clip the call would cut
 * @param request - The call's split
 * @returns The reason, or null
 */
export function cutBlocker(
  clip: LiveAPI,
  request: SplitRequest,
): string | null {
  if ((clip.getProperty("is_arrangement_clip") as number) <= 0) {
    return ignoredText(request.mode.param, SESSION_CLIP);
  }

  return isTakeLaneClip(clip)
    ? ignoredText(
        request.mode.param,
        "this is a take-lane clip; split it in Live's UI",
      )
    : null;
}

/**
 * Cut one clip at the call's positions.
 * @param run - The call's shared state, which holds the cuts so far
 * @param clip - The clip to cut
 * @param request - The call's split
 * @returns The pieces the clip became, or the clip itself when it wasn't cut
 * @throws Error when the cut left no clip to update
 */
export function cutClip(
  run: ClipRun,
  clip: LiveAPI,
  request: SplitRequest,
): LiveAPI[] {
  const { reasons } = run;
  const blocker = cutBlocker(clip, request);

  if (blocker != null) {
    refuseClipWork(reasons, clip.id, blocker);

    return [clip];
  }

  run.split ??= startSplitting(
    request.points,
    { ...run.context, reportClip: clipReporterFor(reasons) },
    request.mode,
  );
  run.split.cut(clip);

  if (!run.split.ranges.has(clip.id)) {
    return [clip];
  }

  // The pieces come from what the split left on the lane, not from the objects
  // held before it: they are stale once the clip is cut.
  const pieces = run.split.piecesOf(clip).filter((piece) => piece.exists());

  // Live keeps the first piece on the id that was named.
  noteLanded(reasons, "split", { id: clip.id });

  if (pieces.length === 0) {
    throw new Error("not updated: no clip was left to update");
  }

  // The cut is work that landed. Without this a piece whose every other param
  // the clip ignored reads as a clip nothing happened to.
  for (const piece of pieces) {
    markClipLanded(reasons, piece.id);
  }

  return pieces;
}
