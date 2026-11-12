// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import {
  returnSlotPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  idDoesNotExist,
  typeMismatch,
} from "#src/tools/shared/validation/id-validation.ts";
import {
  type NamedTarget,
  targetNamed,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { type TargetNames } from "#src/tools/shared/validation/lists/target-lists.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type ClipSlotPosition,
  isReturnSlotPosition,
  type ReturnSlotPosition,
} from "#src/tools/shared/validation/position-parsing.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";

/** A clip slot the action acts on. */
export interface SlotPayload {
  slot: LiveAPI;
  position: ClipSlotPosition | ReturnSlotPosition;
  /** The slot's path, "t0/s1" or "rt0/s1" */
  path: string;
}

/** What one target reports: the slot acted on. */
export interface ClipSlotEntry {
  id?: string;
  path: string;
  detail?: string;
}

/**
 * One path entry, parsed, beside the spelling the caller wrote it in. An entry
 * that names a slot playback can't act on carries why instead of a position.
 */
export type NamedSlotPath =
  | {
      value: string;
      position: ClipSlotPosition | ReturnSlotPosition;
      skip?: undefined;
    }
  | { value: string; skip: string; position?: undefined };

/**
 * The clip slots a call named, ids first, each as the caller wrote it. An id
 * that names no session clip, and a slot that isn't there, keep their place as
 * a skip carrying why.
 * @param ids - The normalized `id` param
 * @param paths - The path entries, parsed and in the caller's spelling
 * @param names - The names the ids and paths were sent under
 * @param names.idParam - The name the ids were sent under
 * @param names.pathParam - The name the paths were sent under
 * @returns One target per entry named, in call order
 */
export function sessionClipTargets(
  ids: string | undefined,
  paths: NamedSlotPath[],
  { idParam, pathParam }: TargetNames,
): Array<Target<SlotPayload>> {
  return [
    ...targetEntries(ids, idParam).map((id) => idTarget(id, idParam)),
    ...paths.map(({ value, position, skip }) => {
      const named = targetNamed("path", value, pathParam);

      return position == null ? { named, skip } : slotTarget(named, position);
    }),
  ];
}

// --- Helpers below main exports ---

/**
 * The slot one id names, or why it names none. A clip off the session grid and
 * an id of the wrong kind both land here rather than stopping the call.
 * @param id - One entry of the `id` param
 * @param idParam - The name the ids were sent under
 * @returns The target
 */
function idTarget(id: string, idParam: string): Target<SlotPayload> {
  const named = targetNamed("id", id, idParam);
  const object = LiveAPI.from(id);

  if (!object.exists()) {
    return { named, skip: idDoesNotExist(id, undefined, idParam) };
  }

  const mismatch = typeMismatch(object, "clip");

  if (mismatch != null) {
    return { named, skip: mismatch };
  }

  const { trackIndex, sceneIndex, returnTrackIndex, returnClipSlotIndex } =
    object;

  if (returnTrackIndex != null && returnClipSlotIndex != null) {
    return slotTarget(named, {
      returnIndex: returnTrackIndex,
      sceneIndex: returnClipSlotIndex,
    });
  }

  if (trackIndex == null || sceneIndex == null) {
    return {
      named,
      skip: `${targetLabel(object)} is not in a clip slot`,
    };
  }

  return slotTarget(named, { trackIndex, sceneIndex });
}

/**
 * The target for a slot, or a skip when the slot isn't there. Two mentions of
 * one slot share a key, so the last one acts.
 * @param named - The target, as the caller named it
 * @param position - The slot's place on the session grid
 * @returns The target
 */
function slotTarget(
  named: NamedTarget,
  position: ClipSlotPosition | ReturnSlotPosition,
): Target<SlotPayload> {
  const { sceneIndex } = position;
  const onReturn = isReturnSlotPosition(position);
  const path = onReturn
    ? returnSlotPath(position.returnIndex, sceneIndex)
    : slotPath(position.trackIndex, sceneIndex);
  const slot = LiveAPI.from(
    (onReturn
      ? livePath.returnTrack(position.returnIndex)
      : livePath.track(position.trackIndex)
    ).clipSlot(sceneIndex),
  );

  return slot.exists()
    ? { named, key: path, data: { slot, position, path } }
    : { named, skip: `no clip slot at ${path}` };
}
