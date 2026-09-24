// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { typeMismatch } from "#src/tools/shared/validation/id-validation.ts";
import {
  loneRefusal,
  namedLaterReason,
  skipEntry,
  type NamedTarget,
  type TargetSkip,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";

/** One clip slot a call named, kept in the caller's own spelling. */
export type ClipSlotTarget = { named: NamedTarget } & (
  | { position: ClipSlotPosition; reason?: undefined }
  | { position?: undefined; reason: string }
);

/** A slot the action acted on. */
interface ActedSlot {
  id?: string;
  path: string;
  reason?: string;
}

/** What one target reports: the slot acted on, or why nothing happened. */
export type ClipSlotEntry = ActedSlot | TargetSkip;

/** One path entry, parsed, beside the spelling the caller wrote it in. */
interface NamedSlotPath {
  value: string;
  position: ClipSlotPosition;
}

/**
 * The clip slots a call named, ids first, each as the caller wrote it. An id
 * that names no session clip keeps its place carrying why.
 * @param ids - The normalized `id` param
 * @param paths - The path entries, parsed and in the caller's spelling
 * @returns One target per entry named, in call order
 */
export function sessionClipTargets(
  ids: string | undefined,
  paths: NamedSlotPath[],
): ClipSlotTarget[] {
  return [
    ...targetEntries(ids, "id").map(idTarget),
    ...paths.map(({ value, position }): ClipSlotTarget => ({
      named: { param: "path", value },
      position,
    })),
  ];
}

/**
 * Acts on every slot the call named and says what happened at each. A slot
 * named twice is acted on once, by the last target to name it; the earlier one
 * points at it.
 * @param action - Action name, for the error when nothing named a slot
 * @param targets - The slots the call named, in call order
 * @param act - What the action does at one slot
 * @returns One entry per target named
 * @throws Error when nothing was named, or when the one target named failed
 */
export function sessionClipEntries(
  action: string,
  targets: ClipSlotTarget[],
  act: (slot: LiveAPI, position: ClipSlotPosition) => void,
): ClipSlotEntry[] {
  if (targets.length === 0) {
    throw new Error(`id or path is required for action "${action}"`);
  }

  const lastNamedBy = new Map<string, NamedTarget>();

  for (const { named, position } of targets) {
    if (position != null) {
      lastNamedBy.set(
        slotPath(position.trackIndex, position.sceneIndex),
        named,
      );
    }
  }

  const entries = targets.map((target) =>
    slotEntry(target, lastNamedBy, act),
  ) satisfies ClipSlotEntry[];

  const refused = loneRefusal(entries);

  if (refused != null) {
    throw new Error(refused);
  }

  return entries;
}

// --- Helpers below main exports ---

/**
 * The slot one id names, or why it names none. A clip off the session grid and
 * an id of the wrong kind both land here rather than stopping the call.
 * @param id - One entry of the `id` param
 * @returns The target
 */
function idTarget(id: string): ClipSlotTarget {
  const named: NamedTarget = { param: "id", value: id };
  const object = LiveAPI.from(id);

  if (!object.exists()) {
    return { named, reason: `id "${id}" does not exist` };
  }

  const mismatch = typeMismatch(object, "clip");

  if (mismatch != null) {
    return { named, reason: mismatch };
  }

  const { trackIndex, sceneIndex } = object;

  if (trackIndex == null || sceneIndex == null) {
    return {
      named,
      reason: `${targetLabel(object)} is not in a clip slot`,
    };
  }

  return { named, position: { trackIndex, sceneIndex } };
}

/**
 * One target's turn: act on its slot, or say why nothing happened there.
 * @param target - The slot, as the caller named it
 * @param lastNamedBy - The last target to name each slot, by path
 * @param act - What the action does at one slot
 * @returns The target's entry
 */
function slotEntry(
  target: ClipSlotTarget,
  lastNamedBy: Map<string, NamedTarget>,
  act: (slot: LiveAPI, position: ClipSlotPosition) => void,
): ClipSlotEntry {
  if (target.position == null) {
    return skipEntry(target.named, target.reason);
  }

  const { trackIndex, sceneIndex } = target.position;
  const path = slotPath(trackIndex, sceneIndex);
  const slot = LiveAPI.from(livePath.track(trackIndex).clipSlot(sceneIndex));

  if (!slot.exists()) {
    return skipEntry(target.named, `no clip slot at ${path}`);
  }

  const clip = slot.child("clip");
  const entry: ActedSlot = { ...(clip.exists() && { id: clip.id }), path };
  const later = lastNamedBy.get(path) as NamedTarget;

  if (later !== target.named) {
    return { ...entry, reason: namedLaterReason(later) };
  }

  act(slot, target.position);

  return entry;
}
