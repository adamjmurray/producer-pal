// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  laneViewOf,
  trackLane,
  type LaneView,
} from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import {
  createAndDeleteTempClip,
  removeTempArrangementClip,
} from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

interface ClearAheadOfClipArgs {
  /** The track whose main lane the clip is on. */
  track: LiveAPI;
  isAudioClip: boolean;
  /** Where the clip ends now, in beats. */
  from: number;
  /** Where it will end, in beats. */
  to: number;
  context: { silenceWavPath?: string; lanes?: LaneView };
  /** Where to say a scratch clip or scene couldn't be removed. */
  reportScratch: (message: string) => void;
}

/**
 * Empties the span a clip is about to grow into. Live stops a growing clip at
 * the next one rather than overwriting it, so a lengthen clears first: a temp
 * clip laid over the span trims or removes what's there, then goes. Nothing is
 * laid when the span is already empty.
 * @param args - Clear arguments
 * @param args.track - The track whose main lane the clip is on
 * @param args.isAudioClip - Whether the track holds audio
 * @param args.from - Where the clip ends now, in beats
 * @param args.to - Where it will end, in beats
 * @param args.context - The call's silence file and lanes
 * @param args.reportScratch - Where to say a scratch clip stayed
 */
export function clearAheadOfClip({
  track,
  isAudioClip,
  from,
  to,
  context,
  reportScratch,
}: ClearAheadOfClipArgs): void {
  const length = to - from;

  if (
    length <= SAME_TIME_EPSILON ||
    laneViewOf(context).overlapping(trackLane(track), from, to, track)
      .length === 0
  ) {
    return;
  }

  createAndDeleteTempClip(
    track,
    from,
    length,
    !isAudioClip,
    {
      ...context,
      silenceWavPath: context.silenceWavPath as string,
      reportScratch,
    },
    // A temp clip Live won't delete is said, not thrown over the clear.
    (id) => removeTempArrangementClip(track, id, reportScratch),
  );
}
