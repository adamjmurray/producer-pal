// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { type TakeLaneTarget } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  arrangementPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import {
  type ArrangementPosition,
  type ClipDestinations,
  type DestinationRef,
} from "../create-clip-destinations.ts";
import { type SongMeter } from "../clip-timing-context.ts";

/** Where one destination puts its clip. */
export interface ClipPosition {
  trackIndex: number;
  /** The scene, for a session clip */
  sceneIndex: number | null;
  /** Where an arrangement clip starts, in beats */
  arrangementStartBeats: number | null;
  /** Where an arrangement clip starts, as the call wrote it */
  arrangementStart: string | null;
  takeLane: TakeLaneTarget | null;
}

/**
 * Resolve the track/scene or arrangement position one destination names.
 * @param destinations - Where the call's clips go
 * @param song - The song's meter
 * @param ref - Which destination it is
 * @returns Position info for this destination
 */
export function resolveClipPosition(
  destinations: ClipDestinations,
  song: SongMeter,
  ref: DestinationRef,
): ClipPosition {
  if (ref.view === "session") {
    const slot = destinations.clipSlots[ref.index] as ClipSlotPosition;

    return {
      trackIndex: slot.trackIndex,
      sceneIndex: slot.sceneIndex,
      arrangementStartBeats: null,
      arrangementStart: null,
      takeLane: null,
    };
  }

  const { trackIndex, arrangementStart, takeLane } = destinations
    .arrangementPositions[ref.index] as ArrangementPosition;

  // The standalone position first, so a 0-indexed or zero-bar start gets the
  // 1-indexing steer rather than a silent pre-origin beat.
  validateBarBeatPosition(arrangementStart);

  return {
    trackIndex,
    sceneIndex: null,
    arrangementStartBeats: barBeatToAbletonBeats(
      arrangementStart,
      song.songTimeSigNumerator,
      song.songTimeSigDenominator,
    ),
    arrangementStart,
    takeLane,
  };
}

/**
 * Where a clip is being created, in the words an entry for it would use.
 * @param position - The resolved position
 * @returns A destination like `t0/s1` or `t0/l1[5|1]`
 */
export function clipPositionLabel(position: ClipPosition): string {
  return position.sceneIndex == null
    ? `${arrangementPath(position.trackIndex, position.takeLane)}[${position.arrangementStart}]`
    : slotPath(position.trackIndex, position.sceneIndex);
}
