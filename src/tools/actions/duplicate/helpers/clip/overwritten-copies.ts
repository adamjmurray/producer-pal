// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a duplicate result says about a copy another copy in the same call
// landed on top of.

import { remainderFinder } from "#src/tools/shared/arrangement/helpers/clip-remainders.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import {
  objectPathForApi,
  stillAtPath,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { copySpan, type MinimalClipInfo } from "../minimal-clip-info.ts";

/** What became of a copy a later copy covered whole. */
const DELETED = "a later copy in this call landed on it";

/** What became of a copy a later copy covered only the front of. */
const TRIMMED = "trimmed: a later copy in this call landed on its start";

/** A copy a later copy in the same call deleted. It has no id: it is gone. */
interface DeletedCopyInfo {
  path: string;
  /** The scenes this copy made, which outlive it. */
  created?: string;
  deleted: true;
  detail: string;
}

/** One clip entry, and where it sits in the result so it can be replaced. */
interface ClipSlot {
  list: object[];
  index: number;
  entry: MinimalClipInfo;
}

/**
 * Fixes the entry of every copy that is no longer where the result put it.
 *
 * Writing into an arrangement range clears what is there, and a copy already
 * made is as clearable as anything else: landing on one deletes it, and landing
 * across its front re-creates the rest under a new id. Either way the id
 * already reported names nothing, so the entry is marked deleted or pointed at
 * the rest.
 *
 * Each copy is checked by reading its id back, not by comparing the paths the
 * call reported: a copy can be cleared by one that starts somewhere else.
 * @param createdObjects - The clip results of one call, mutated in place
 */
export function markOverwrittenCopies(createdObjects: object[]): void {
  const slots = clipSlots(createdObjects);

  // A lone copy has nothing in the call that could have buried it — which is
  // most calls, and they skip the read-back entirely.
  if (slots.length < 2) {
    return;
  }

  const gone = goneCopies(slots);
  // A clip another entry still names isn't this copy's rest.
  const taken = new Set(
    slots.filter((slot) => !gone.has(slot)).map(({ entry }) => entry.id),
  );
  const findRemainder = remainderFinder();

  // Latest landed first: a later copy's rest can end where an earlier copy
  // did, and it has to be claimed by its own entry. Result order won't do —
  // copies onto a source land last but keep their place in the result.
  const byLanding = [...gone]
    .map(([slot, path]) => ({ slot, path, span: copySpan(slot.entry) }))
    .toSorted((a, b) => (b.span?.order ?? -1) - (a.span?.order ?? -1));

  for (const { slot, path, span } of byLanding) {
    const rest = span == null ? null : findRemainder(span, taken);
    const restPath = rest == null ? undefined : objectPathForApi(rest);

    if (rest != null && restPath != null) {
      taken.add(rest.id);
      slot.entry.id = rest.id;
      slot.entry.path = restPath;
      appendDetail(slot.entry, TRIMMED);
      continue;
    }

    slot.list[slot.index] = deletedCopy(path, slot.entry);
  }
}

/**
 * Every clip a duplicate result reports, flattening the groups arrangement
 * tiling nests under `clips`. A deleted copy is left out — there is no clip
 * left to read or write.
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
 * The copies no longer where their entries put them, in result order.
 * @param slots - Every clip entry in the result
 * @returns Each such copy, with the path its entry reported
 */
function goneCopies(slots: ClipSlot[]): Map<ClipSlot, string> {
  const gone = new Map<ClipSlot, string>();

  for (const slot of slots) {
    const { id, path } = slot.entry;

    if (path != null && !stillAtPath(id, path)) {
      gone.set(slot, path);
    }
  }

  return gone;
}

/**
 * The entry a deleted copy keeps. Any earlier detail described the clip that
 * is gone, so only this one stays.
 * @param path - Where the copy was
 * @param entry - The copy's entry
 * @returns The entry, with no id
 */
function deletedCopy(path: string, entry: MinimalClipInfo): DeletedCopyInfo {
  return {
    path,
    ...(entry.created != null && { created: entry.created }),
    deleted: true,
    detail: DELETED,
  };
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
 * replaced by a deleted marker has no id left.
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
