// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  returnSlotPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  type ClipSlotPosition,
  isReturnSlotPosition,
  type ReturnSlotPosition,
} from "#src/tools/shared/validation/position-parsing.ts";

/** A clip slot on a regular track or on a Live 13 return track. */
export type AnySlotPosition = ClipSlotPosition | ReturnSlotPosition;

/**
 * The Live path of a clip slot.
 * @param position - A slot on a regular or a return track
 * @returns The slot's path
 */
export function slotLivePath(
  position: AnySlotPosition,
): ReturnType<ReturnType<typeof livePath.track>["clipSlot"]> {
  const track = isReturnSlotPosition(position)
    ? livePath.returnTrack(position.returnIndex)
    : livePath.track(position.trackIndex);

  return track.clipSlot(position.sceneIndex);
}

/**
 * The path a slot is written as in a call.
 * @param position - A slot on a regular or a return track
 * @returns "t0/s1", or "rt0/s1" on a return track
 */
export function slotPositionText(position: AnySlotPosition): string {
  return isReturnSlotPosition(position)
    ? returnSlotPath(position.returnIndex, position.sceneIndex)
    : slotPath(position.trackIndex, position.sceneIndex);
}
