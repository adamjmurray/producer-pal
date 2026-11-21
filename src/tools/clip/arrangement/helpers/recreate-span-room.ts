// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { clearAheadOfClip } from "./clear-ahead-of-clip.ts";
import {
  clipLane,
  laneViewOf,
  startsAtBeats,
  type LaneView,
} from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";

/** Why a re-created clip came out shorter than its source. */
export const LIVE_SHORTENED_IT = "Live shortened the new clip";

/** Why a take-lane clip stopped short of the length asked for. */
export const NEXT_CLIP_ON_LANE = "the next clip on the lane starts there";

/** What clearing a main lane needs from the call. */
export interface SpanRoomContext {
  /** The silent file an audio temp clip is made from. */
  silenceWavPath?: string;
  lanes?: LaneView;
  /** Where to say a scratch clip stayed; unset puts it with the copy's losses. */
  reportScratch?: (message: string) => void;
}

/** How a re-created audio copy gets, or fails to get, the room it grows into. */
export interface SpanRoom {
  /** Empties the lane from the copy's end to the end of the source's span. */
  clearAhead: (copy: LiveAPI, span: number) => void;
  /** Why a copy that is still shorter than its source is. */
  shortCause: (copy: LiveAPI) => string;
}

/**
 * The room a re-created audio copy has to grow to its source's span. Live
 * sizes a new audio clip to its sample and stops a growing clip at the next
 * one, so on a main lane the span is cleared first, the way a plain duplicate
 * overwrites it. A take lane can't be cleared (Live deletes no temp clip
 * there), so there the copy stops at its neighbor and says so.
 * @param destination - Where the copy lands: a TakeLane, or a Track
 * @param context - The call's silence file and lanes
 * @param losses - What the re-create lost, added to
 * @returns How to clear ahead of the copy, and why it came out short
 */
export function recreateSpanRoom(
  destination: LiveAPI,
  context: SpanRoomContext,
  losses: string[],
): SpanRoom {
  if (destination.type !== "TakeLane") {
    return {
      clearAhead: (copy, span) =>
        clearAheadOfClip({
          track: destination,
          isAudioClip: true,
          from: copy.getProperty("end_time") as number,
          to: (copy.getProperty("start_time") as number) + span,
          context,
          reportScratch:
            context.reportScratch ?? ((message) => losses.push(message)),
        }),
      shortCause: () => LIVE_SHORTENED_IT,
    };
  }

  return {
    clearAhead: () => {},
    shortCause: (copy) => {
      const lane = clipLane(copy);
      const end = copy.getProperty("end_time") as number;
      const stopped =
        lane != null &&
        laneViewOf(context)
          .clips(lane, destination)
          .some(({ id, start }) => id !== copy.id && startsAtBeats(start, end));

      return stopped ? NEXT_CLIP_ON_LANE : LIVE_SHORTENED_IT;
    },
  };
}
