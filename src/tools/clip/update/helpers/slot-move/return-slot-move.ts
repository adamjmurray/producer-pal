// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { keepClip } from "#src/tools/clip/helpers/clip-results.ts";
import { returnSlotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type ReturnSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import {
  type MoveSlot,
  moveBetweenSlots,
  refuseSlotMove,
  type SlotMoveCollectors,
} from "./clip-slot-move.ts";

interface ReturnSlotMoveArgs extends SlotMoveCollectors {
  toSlot: ReturnSlotPosition;
}

/**
 * Move an envelope clip to another return track's clip slot, by Live's own copy
 * and then deleting the original, as a move between slots of regular tracks.
 * @param args - The clip, where it goes, and what the move collects into
 * @param args.clip - The envelope clip to move
 * @param args.toSlot - Destination slot on a return track
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for result
 * @param args.reasons - What each clip has to say beyond its result
 */
export function handleReturnSlotMove(args: ReturnSlotMoveArgs): void {
  const { clip, toSlot } = args;
  // Only an envelope clip gets here, and it always sits in a slot.
  const returnTrackIndex = clip.returnTrackIndex as number;
  const returnClipSlotIndex = clip.returnClipSlotIndex as number;

  // Same slot: no-op
  if (
    returnTrackIndex === toSlot.returnIndex &&
    returnClipSlotIndex === toSlot.sceneIndex
  ) {
    keepClip(clip, args.updatedClips, args.noteResult);

    return;
  }

  // Checked before the slot, so no scene is made to reach a missing track.
  const destinationText = returnSlotPath(toSlot.returnIndex, toSlot.sceneIndex);

  if (!LiveAPI.from(livePath.returnTrack(toSlot.returnIndex)).exists()) {
    refuseSlotMove(args, `destination ${destinationText} does not exist`);

    return;
  }

  moveBetweenSlots(
    args,
    returnMoveSlot(returnTrackIndex, returnClipSlotIndex),
    returnMoveSlot(toSlot.returnIndex, toSlot.sceneIndex),
  );
}

// --- Helpers below main export ---

/**
 * A return track's slot, as a move reads it.
 * @param returnIndex - The return track
 * @param sceneIndex - The scene
 * @returns The slot, addressed for a move
 */
function returnMoveSlot(returnIndex: number, sceneIndex: number): MoveSlot {
  return {
    path: livePath.returnTrack(returnIndex).clipSlot(sceneIndex),
    text: returnSlotPath(returnIndex, sceneIndex),
    sceneIndex,
  };
}
