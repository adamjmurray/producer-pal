// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-results.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  type ArrangementTrack,
  takeLaneFromPath,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  noteClipReason,
  refuseClipWork,
  type ClipReasons,
} from "../entries/clip-reasons.ts";
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
  /** The param that named arrangementStartBeats. */
  startParam: "toPath" | "arrangementStart";
  arrangementStartBeats?: number | null;
  arrangementLengthBeats?: number | null;
  movedClipGroups: Map<string, MoveGroup>;
  /** Destination tracks the batch has already resolved, keyed by track index. */
  destinationTracks?: Map<number, LiveAPI>;
  context: Partial<ToolContext>;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
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
      noteClipReason(
        args.reasons,
        clip.id,
        `${destinationParam} ignored: a clip slot is off the arrangement timeline the other position params name`,
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
        reasons: args.reasons,
      });

      return;
    }
  }

  // A refused move leaves the clip where it is; any resize still runs.
  const refused = refuseSessionClipMove(args);

  handleArrangementOperations({
    clip,
    isAudioClip: args.isAudioClip,
    arrangementStartBeats: refused ? null : arrangementStartBeats,
    arrangementLengthBeats,
    destination: refused ? null : arrangementDestination(destination),
    movedClipGroups: args.movedClipGroups,
    context: args.context,
    updatedClips: args.updatedClips,
    noteResult: args.noteResult,
    reasons: args.reasons,
    isNonSurvivor: args.isNonSurvivor,
  });
}

/**
 * Refuse an arrangement move of a session clip, on the clip's own entry.
 *
 * The move is copy-then-delete through `duplicate_clip_to_arrangement`, which
 * takes an arrangement source only. The reason names the param the caller
 * sent: a toPath `[...]` is a spelling of the start, not arrangementStart.
 * @param args - The clip and where the call sends it
 * @returns Whether the move was refused
 */
function refuseSessionClipMove(args: HandlePositionOperationsArgs): boolean {
  const { clip, destination, arrangementStartBeats } = args;
  const lane =
    destination != null && destination.kind !== "slot" ? destination : null;

  if (
    (lane == null && arrangementStartBeats == null) ||
    (clip.getProperty("is_arrangement_clip") as number) > 0
  ) {
    return false;
  }

  // The caller sent arrangementStart itself, so that's the param to name.
  if (lane == null && args.startParam === "arrangementStart") {
    refuseClipWork(
      args.reasons,
      clip.id,
      "arrangementStart ignored: this is a session clip",
    );

    return true;
  }

  const named =
    lane == null
      ? "toPath names an arrangement position"
      : `${args.destinationParam} "${formatObjectPath(lane)}" names an arrangement lane`;

  refuseClipWork(
    args.reasons,
    clip.id,
    `not moved: ${named} and this is a session clip; ` +
      `name a clip slot ("t2/s3") to move it, or use ppal-duplicate to copy it into the arrangement`,
  );

  return true;
}

/**
 * Reads a destination as an arrangement lane, or null when it isn't one.
 * @param destination - Where the call named it to go, if anywhere
 * @returns The destination track and lane, or null
 */
function arrangementDestination(
  destination: ClipPath | null | undefined,
): ArrangementTrack | null {
  if (destination == null || destination.kind === "slot") {
    return null;
  }

  return {
    trackIndex: destination.trackIndex,
    takeLane: takeLaneFromPath(destination),
  };
}
