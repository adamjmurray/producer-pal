// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-results.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import {
  type ArrangementTrack,
  takeLaneFromPath,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { handleArrangementOperations } from "../arrangement/arrangement-move.ts";
import { type MoveGroup } from "../arrangement/update-clip-move-groups.ts";
import {
  handleArrangementToSlotMove,
  handleClipSlotMove,
} from "../slot-move/clip-slot-move.ts";

interface HandlePositionOperationsArgs {
  clip: LiveAPI;
  isAudioClip: boolean;
  destination?: ClipPath | null;
  destinationParam: "toPath" | "toSlot";
  arrangementStartBeats?: number | null;
  arrangementLengthBeats?: number | null;
  movedClipGroups: Map<string, MoveGroup>;
  /** Destination tracks the batch has already resolved, keyed by track index. */
  destinationTracks?: Map<number, LiveAPI>;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
  isNonSurvivor: boolean;
}

/**
 * Handle clip position operations: a move to a clip slot, or the arrangement
 * operations — which now cover a move to another track or take lane.
 * @param args - Operation arguments
 */
export function handlePositionOperations(
  args: HandlePositionOperationsArgs,
): void {
  const { clip, destination, arrangementStartBeats, arrangementLengthBeats } =
    args;
  const { destinationParam } = args;

  if (destination?.kind === "slot") {
    // A slot is off the arrangement timeline, so the two ask for different
    // places at once. Arrangement destinations are the opposite: they combine
    // with arrangementStart, which says where on the destination lane to land.
    if (arrangementStartBeats != null || arrangementLengthBeats != null) {
      console.warn(
        `${destinationParam} ignored when arrangement parameters are specified`,
      );
    } else {
      const move =
        (clip.getProperty("is_arrangement_clip") as number) > 0
          ? handleArrangementToSlotMove
          : handleClipSlotMove;

      move({
        clip,
        toSlot: {
          trackIndex: destination.trackIndex,
          sceneIndex: destination.sceneIndex,
        },
        destinationTracks: args.destinationTracks,
        updatedClips: args.updatedClips,
        noteResult: args.noteResult,
      });

      return;
    }
  }

  handleArrangementOperations({
    clip,
    isAudioClip: args.isAudioClip,
    arrangementStartBeats,
    arrangementLengthBeats,
    destination: arrangementDestination(clip, destination, destinationParam),
    movedClipGroups: args.movedClipGroups,
    context: args.context,
    updatedClips: args.updatedClips,
    noteResult: args.noteResult,
    isNonSurvivor: args.isNonSurvivor,
  });
}

/**
 * Reads a destination as an arrangement lane, or null when it isn't one.
 *
 * A session clip can't move onto a lane: the arrangement move is copy-then-
 * delete through `duplicate_clip_to_arrangement`, which takes an arrangement
 * source only. Warn and leave the clip in its slot.
 * @param clip - The clip being moved
 * @param destination - Where the call named it to go, if anywhere
 * @param destinationParam - The param the caller used, for the warning
 * @returns The destination track and lane, or null
 */
function arrangementDestination(
  clip: LiveAPI,
  destination: ClipPath | null | undefined,
  destinationParam: "toPath" | "toSlot",
): ArrangementTrack | null {
  if (destination == null || destination.kind === "slot") {
    return null;
  }

  if ((clip.getProperty("is_arrangement_clip") as number) <= 0) {
    console.warn(
      `${destinationParam} "${formatObjectPath(destination)}" names an arrangement lane, so session clip ` +
        `${targetLabel(clip)} was not moved; name a clip slot ("t2/s3") to move it, or use ppal-duplicate to copy it into the arrangement`,
    );

    return null;
  }

  return {
    trackIndex: destination.trackIndex,
    takeLane: takeLaneFromPath(destination),
  };
}
