// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import {
  arrangementSpanOf,
  resizeArrangementClip,
} from "#src/tools/shared/arrangement/arrangement-clip-resize.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { requireTrackIndex } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  noteClipReason,
  noteLanded,
  type ClipReasons,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import { clearAheadOfClip } from "./clear-ahead-of-clip.ts";
import {
  handleUnloopedLengthening,
  LIVE_STOPPED_IT,
  noteLandedShort,
} from "./unlooped-lengthening.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

export interface ArrangementContext {
  silenceWavPath?: string;
  /** What is on the arrangement lanes, shared with every write in the call. */
  lanes?: LaneView;
}

export interface ClipIdResult {
  id: string;
}

interface HandleArrangementLengtheningArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentArrangementLength: number;
  currentStartTime: number;
  currentEndTime: number;
  context: ArrangementContext;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
}

/**
 * Lengthens an arrangement clip in place, overwriting whatever it grows over.
 * @param options - Parameters object
 * @param options.clip - The LiveAPI clip object to lengthen
 * @param options.isAudioClip - Whether the clip is an audio clip
 * @param options.arrangementLengthBeats - Target length in beats
 * @param options.currentArrangementLength - Current length in beats
 * @param options.currentStartTime - Current start time in beats
 * @param options.currentEndTime - Current end time in beats
 * @param options.context - Per-request context
 * @param options.reasons - What each clip has to say beyond its result
 * @returns The clip, when it grew
 */
export function handleArrangementLengthening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentStartTime,
  currentEndTime,
  context,
  reasons,
}: HandleArrangementLengtheningArgs): ClipIdResult[] {
  const track = LiveAPI.from(livePath.track(requireTrackIndex(clip)));

  // A take lane can't be cleared: Live deletes no temp clip there. The caller
  // stops a take-lane clip at its neighbor instead.
  const clearAhead = (targetEnd: number): void => {
    if (isTakeLaneClip(clip)) {
      return;
    }

    clearAheadOfClip({
      track,
      isAudioClip,
      from: currentEndTime,
      to: targetEnd,
      context,
      // A scratch clip Live won't remove is this clip's to report.
      reportScratch: (message) => noteClipReason(reasons, clip.id, message),
    });
  };

  if ((clip.getProperty("looping") as number) === 0) {
    const grown = handleUnloopedLengthening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentEndTime,
      track,
      clearAhead,
      reasons,
    });

    // It returns the clip only when it grew.
    if (grown.length > 0) {
      noteLanded(reasons, "lengthened", { id: clip.id });
    }

    return grown;
  }

  clearAhead(currentStartTime + arrangementLengthBeats);

  const landed = resizeSayingChange(
    clip,
    arrangementLengthBeats,
    isAudioClip,
    () => noteLanded(reasons, "lengthened", { id: clip.id }),
  );

  // Clearing leaves nothing to stop it, so this is Live refusing the span.
  if (landed < arrangementLengthBeats - SAME_TIME_EPSILON) {
    noteLandedShort(reasons, clip.id, landed, LIVE_STOPPED_IT);
  }

  noteLanded(reasons, "lengthened", { id: clip.id });

  return [{ id: clip.id }];
}

interface HandleArrangementShorteningArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  context: ArrangementContext;
  /** Called once the clip is cut, even if a step after it throws */
  onCut?: () => void;
}

/**
 * Shortens an arrangement clip in place.
 * @param options - Parameters object
 * @param options.clip - The LiveAPI clip object to shorten
 * @param options.isAudioClip - Whether the clip is an audio clip
 * @param options.arrangementLengthBeats - Target length in beats
 * @param options.context - Tool execution context
 * @param options.onCut - Called once the clip is cut
 */
export function handleArrangementShortening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  context,
  onCut,
}: HandleArrangementShorteningArgs): void {
  context.lanes?.clipChanged(clip);
  resizeSayingChange(clip, arrangementLengthBeats, isAudioClip, () =>
    onCut?.(),
  );
  onCut?.();
}

/**
 * Resize a clip in place. A throw partway still says the clip changed when its
 * span did, so the entry names what landed.
 * @param clip - The arrangement clip
 * @param spanBeats - Target span in beats
 * @param isAudioClip - Whether the clip is audio
 * @param onChangedBeforeThrow - Told when a throw follows a span change
 * @returns The span the clip landed at, in beats
 */
function resizeSayingChange(
  clip: LiveAPI,
  spanBeats: number,
  isAudioClip: boolean,
  onChangedBeforeThrow: () => void,
): number {
  const before = arrangementSpanOf(clip);

  try {
    return resizeArrangementClip({ clip, spanBeats, isAudioClip });
  } catch (error) {
    if (spanChangedFrom(clip, before)) {
      onChangedBeforeThrow();
    }

    throw error;
  }
}

/**
 * @param clip - The arrangement clip
 * @param before - Its span before the resize, in beats
 * @returns Whether its span changed; false when it can't be read
 */
function spanChangedFrom(clip: LiveAPI, before: number): boolean {
  try {
    return Math.abs(arrangementSpanOf(clip) - before) > SAME_TIME_EPSILON;
  } catch {
    return false;
  }
}
