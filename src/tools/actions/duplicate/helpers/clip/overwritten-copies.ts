// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a duplicate result says about a copy another copy in the same call
// landed on top of.

import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type MinimalClipInfo } from "../minimal-clip-info.ts";

/** A copy a later copy in the same call replaced. It has no id: it is gone. */
interface OverwrittenClipInfo {
  path: string;
  overwritten: true;
}

/** One clip entry, and where it sits in the result so it can be replaced. */
interface ClipSlot {
  list: object[];
  index: number;
  entry: MinimalClipInfo;
}

/**
 * Replaces the entry of every copy that is no longer where the result put it.
 *
 * Writing into an arrangement range clears what is there, and a copy already
 * made is as clearable as anything else: landing on one deletes it outright,
 * and landing across its front leaves a shortened clip elsewhere under a new
 * id. Either way the id already reported names nothing, and a caller that
 * spends it gets an error for a clip this call said it made.
 *
 * Each copy is checked by reading its id back, not by comparing the paths the
 * call reported: a copy can be cleared by one that starts somewhere else, so
 * two entries with different paths can still be one clip and one corpse.
 * @param createdObjects - The clip results of one call, mutated in place
 */
export function markOverwrittenCopies(createdObjects: object[]): void {
  const slots = clipSlots(createdObjects);

  // A lone copy has nothing in the call that could have buried it — which is
  // most calls, and they skip the read-back entirely.
  if (slots.length < 2) {
    return;
  }

  for (const slot of slots) {
    const { path } = slot.entry;

    if (path == null || stillAt(slot.entry.id, path)) {
      continue;
    }

    const marker: OverwrittenClipInfo = { path, overwritten: true };

    slot.list[slot.index] = marker;
  }
}

/**
 * Every clip a duplicate result reports, flattening the groups arrangement
 * tiling nests under `clips`. A copy that was overwritten is left out — there
 * is no clip left to read or write.
 * @param createdObjects - Result objects from clip duplication
 * @returns The clips, in the order they were made
 */
export function collectClipResults(
  createdObjects: object[],
): MinimalClipInfo[] {
  return clipSlots(createdObjects).map((slot) => slot.entry);
}

// --- Helpers below main exports ---

/**
 * Whether an id still names a clip at the path the result gave it.
 *
 * Looked up fresh every time, never off an object the call kept: a dead one
 * goes on reporting its id, and `exists()` with it, so only a new lookup reads
 * the empty path that says it is gone (dev/LiveAPI-Object-Reuse.md).
 * @param id - The id the result reported
 * @param path - The path the result reported
 * @returns True when the clip is still there
 */
function stillAt(id: string, path: string): boolean {
  return objectPathForApi(LiveAPI.from(id)) === path;
}

/**
 * Finds every clip entry in a result, top-level or nested under `clips`.
 * @param createdObjects - Result objects from clip duplication
 * @returns One slot per clip entry
 */
function clipSlots(createdObjects: object[]): ClipSlot[] {
  const slots: ClipSlot[] = [];

  for (let index = 0; index < createdObjects.length; index++) {
    const entry = createdObjects[index] as object;

    if ("clips" in entry) {
      const { clips } = entry as { clips: object[] };

      for (let i = 0; i < clips.length; i++) {
        addSlot(slots, clips, i);
      }

      continue;
    }

    addSlot(slots, createdObjects, index);
  }

  return slots;
}

/**
 * Adds one entry to the list, unless it names no clip — an entry already
 * replaced by an overwritten marker has no id left.
 * @param slots - The slots collected so far
 * @param list - The array holding the entry
 * @param index - Where the entry sits in that array
 */
function addSlot(slots: ClipSlot[], list: object[], index: number): void {
  const entry = list[index];

  if (entry != null && "id" in entry) {
    slots.push({ list, index, entry: entry as MinimalClipInfo });
  }
}
