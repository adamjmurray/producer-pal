// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
import { SESSION_CLIP, ignoredText } from "#src/shared/max/ignored-wording.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

interface HandleArrangementLengthOperationArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  context: ArrangementContext;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
}

/**
 * Handle arrangement length changes: resize the clip in place
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
      ignoredText("arrangementLength", SESSION_CLIP),
    );

    return updatedClips;
  }

  // Lengthening clears its way with a temp clip on the main lane, and a take
  // lane has no clip delete to remove one. The clip's own entry says so.
  if (isTakeLaneClip(clip)) {
    refuseClipWork(
      reasons,
      clip.id,
      ignoredText(
        "arrangementLength",
        "this is a take-lane clip; adjust it in Live's UI",
      ),
    );

    return updatedClips;
  }

  // Get current clip dimensions
  const currentStartTime = clip.getProperty("start_time") as number;
  const currentEndTime = clip.getProperty("end_time") as number;
  const currentArrangementLength = currentEndTime - currentStartTime;

  // Check if shortening, lengthening, or same. A length that differs by less
  // than SAME_TIME_EPSILON is the same one: read-clip rounds, so a caller echoing back
  // the length it read must not lengthen the clip.
  if (arrangementLengthBeats > currentArrangementLength + SAME_TIME_EPSILON) {
    // Growing into the lane overwrites whatever sits after the clip, so note
    // the lane first and say what the growth cost. This clip's ledger starts
    // here, from the call's lane view, so it hears of nothing before it.
    const lane: ArrangementLane = {
      kind: "track",
      trackIndex: clip.trackIndex as number,
    };
    const ledger = new LaneLedger({ lanes: laneViewOf(context) });

    ledger.scan(lane);

    const reach = {
      start: currentStartTime,
      end: currentStartTime + arrangementLengthBeats,
    };
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
      noteClearedBeforeThrow(ledger, lane, clip.id, reach, reasons);
      // The lane may have changed unseen, so the view forgets it.
      ledger.forget(lane);
      throw error;
    }

    // The clip describes itself. Lengthening clears ahead of the clip, so
    // everything up to the target counts as written.
    const displaced = ledger.afterWrite(
      lane,
      [clip.id, ...result.map(({ id }) => id)],
      { reach },
    );

    // What the clearing overwrote changed the Set, even if the clip didn't grow.
    if (displaced != null) {
      markClipLanded(reasons, clip.id);
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
    handleArrangementShortening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      context,
      // The clip is cut in place, so it is updated, not a clip left as it was.
      onCut: () => {
        markClipLanded(reasons, clip.id);
        noteLanded(reasons, "shortened", { id: clip.id });
      },
    });
  }

  return updatedClips;
}

/**
 * Whether an arrangementLength shortens a clip's arrangement span.
 * @param startTime - The clip's start_time, in beats
 * @param endTime - The clip's end_time, in beats
 * @param arrangementLengthBeats - Target length in beats
 * @returns True when the target is shorter than the clip is now, by more than
 *   the rounding a read-back allows
 */
export function shortensArrangementClip(
  startTime: number,
  endTime: number,
  arrangementLengthBeats: number,
): boolean {
  return arrangementLengthBeats < endTime - startTime - SAME_TIME_EPSILON;
}

/**
 * Say what a lengthen overwrote before it threw: the clearing ahead of the clip
 * has landed whatever the resize did, so the entry keeps it. A read-back that
 * fails too says nothing more.
 * @param ledger - The clip's lane ledger, scanned before the write
 * @param lane - The clip's lane
 * @param clipId - The clip
 * @param reach - The span the lengthen was to cover
 * @param reach.start - Where it begins, in beats
 * @param reach.end - Where it ends, in beats
 * @param reasons - What each clip has to say, carrying the journal
 */
function noteClearedBeforeThrow(
  ledger: LaneLedger,
  lane: ArrangementLane,
  clipId: string,
  reach: { start: number; end: number },
  reasons: ClipReasons,
): void {
  let displaced: string | undefined;

  try {
    displaced = ledger.afterWrite(lane, [clipId], { reach });
  } catch {
    return;
  }

  // A throw that reaches the entry drops the clip's reasons, so the landing
  // carries it too. One caught on the way (after a move) keeps the reason.
  if (displaced != null) {
    noteClipReason(reasons, clipId, displaced);
    noteLanded(reasons, displaced, { id: clipId });
  }
}
