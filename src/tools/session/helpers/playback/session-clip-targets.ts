// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { typeMismatch } from "#src/tools/shared/validation/id-validation.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";

/** A clip slot the action acts on. */
export interface SlotPayload {
  slot: LiveAPI;
  position: ClipSlotPosition;
  /** The slot's path, "t0/s1" */
  path: string;
}

/** What one target reports: the slot acted on. */
export interface ClipSlotEntry {
  id?: string;
  path: string;
  detail?: string;
}

/** One path entry, parsed, beside the spelling the caller wrote it in. */
interface NamedSlotPath {
  value: string;
  position: ClipSlotPosition;
}

/**
 * The clip slots a call named, ids first, each as the caller wrote it. An id
 * that names no session clip, and a slot that isn't there, keep their place as
 * a skip carrying why.
 * @param ids - The normalized `id` param
 * @param paths - The path entries, parsed and in the caller's spelling
 * @returns One target per entry named, in call order
 */
export function sessionClipTargets(
  ids: string | undefined,
  paths: NamedSlotPath[],
): Array<Target<SlotPayload>> {
  return [
    ...targetEntries(ids, "id").map(idTarget),
    ...paths.map(({ value, position }) =>
      slotTarget({ param: "path", value }, position),
    ),
  ];
}

// --- Helpers below main exports ---

/**
 * The slot one id names, or why it names none. A clip off the session grid and
 * an id of the wrong kind both land here rather than stopping the call.
 * @param id - One entry of the `id` param
 * @returns The target
 */
function idTarget(id: string): Target<SlotPayload> {
  const named: NamedTarget = { param: "id", value: id };
  const object = LiveAPI.from(id);

  if (!object.exists()) {
    return { named, skip: `id "${id}" does not exist` };
  }

  const mismatch = typeMismatch(object, "clip");

  if (mismatch != null) {
    return { named, skip: mismatch };
  }

  const { trackIndex, sceneIndex } = object;

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
  position: ClipSlotPosition,
): Target<SlotPayload> {
  const { trackIndex, sceneIndex } = position;
  const path = slotPath(trackIndex, sceneIndex);
  const slot = LiveAPI.from(livePath.track(trackIndex).clipSlot(sceneIndex));

  return slot.exists()
    ? { named, key: path, data: { slot, position, path } }
    : { named, skip: `no clip slot at ${path}` };
}
