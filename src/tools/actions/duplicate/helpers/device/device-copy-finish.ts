// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import {
  type DeviceMove,
  checkMoveDestination,
  moveDeviceToPath,
} from "#src/tools/device/update/helpers/move-device.ts";
import { withChainsLeft } from "#src/tools/shared/device/helpers/path/chains-left.ts";
import {
  type TargetNotes,
  noteTarget,
} from "#src/tools/shared/helpers/target-notes.ts";

// What both ways of copying a device share: checking the destination before
// the copy is made, then moving the copy there and naming it.

/**
 * Refuse a copy whose destination can't take it, before the copy is made. Says
 * what moveDeviceCopy would say once the copy existed, for what is known up
 * front; the rest is left to that move, which deletes a copy it can't place.
 * @param source - The device to copy
 * @param destination - The path as the caller wrote it
 * @param sourceLabel - The source, named for errors
 * @throws Error when the destination can't take the copy
 */
export function checkDeviceCopyDestination(
  source: LiveAPI,
  destination: string,
  sourceLabel: string,
): void {
  const refusal = checkMoveDestination(source, destination);

  if (refusal != null) {
    throw moveFailure(refusal, destination, sourceLabel);
  }
}

/**
 * Move a device copy to where the caller asked, in the one wording both ways of
 * copying a device share.
 * @param copy - The copy to move
 * @param moveTo - Where to move it, which a temp track may have shifted
 * @param source - The device that was copied
 * @param destination - The path as the caller wrote it
 * @param sourceLabel - The source, named for errors
 * @returns The rack chains the move had to make first ("c2-c3"), if any
 * @throws Error when the copy could not be moved
 */
export function moveDeviceCopy(
  copy: LiveAPI,
  moveTo: string,
  source: LiveAPI,
  destination: string,
  sourceLabel: string,
): string | undefined {
  // Name the caller's path and the real source, not what the move was aimed
  // at: a temp track shifts its track index and goes away afterwards.
  const move = moveDeviceToPath(copy, moveTo, source, destination);

  if (move.outcome !== "moved") {
    throw moveFailure(move, destination, sourceLabel);
  }

  return move.created;
}

/**
 * Word a move that didn't happen.
 * @param move - What the move did
 * @param move.outcome - How the move ended
 * @param move.reason - Why it didn't happen, when it says
 * @param move.madeChains - The chains it made first and left
 * @param destination - The path as the caller wrote it
 * @param sourceLabel - The source, named for errors
 * @returns The error to throw
 */
function moveFailure(
  { outcome, reason, madeChains }: DeviceMove,
  destination: string,
  sourceLabel: string,
): Error {
  if (outcome === "no-destination") {
    return new Error(
      withChainsLeft(
        `${sourceLabel} not copied — no destination at toPath "${destination}"`,
        madeChains,
      ),
    );
  }

  if (outcome === "refused") {
    const refusal = `the copy of ${sourceLabel} could not be moved to "${destination}"`;

    return new Error(
      withChainsLeft(
        reason == null ? refusal : `${refusal}: ${reason}`,
        madeChains,
      ),
    );
  }

  return new Error(`${sourceLabel} not copied — ${reason}`);
}

/**
 * Name a device copy. The copy exists either way, so a name that won't take is
 * on the notes, not a throw.
 * @param copy - The copy
 * @param name - The name, if the caller gave one
 * @param notes - What the device's entry has to say, added to
 */
export function nameDeviceCopy(
  copy: LiveAPI,
  name: string | undefined,
  notes: TargetNotes,
): void {
  if (!name) {
    return;
  }

  try {
    copy.set("name", name);
  } catch (error) {
    noteTarget(
      notes,
      `the device was copied, but naming it failed: ${errorMessage(error)}`,
    );
  }
}
