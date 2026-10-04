// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a duplicate result says about a copy another copy in the same call
// landed on top of, when the call didn't see it coming. A copy a later one goes
// over whole is never written, and one it goes over in part is noted as it is
// written; this is the rest: Live clearing a stretch nobody predicted.

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { type LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { claimRemainders } from "#src/tools/shared/arrangement/helpers/clip-remainders.ts";
import { writtenOverBy } from "#src/tools/shared/clip/landings/landing-log.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { stillAtPath } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  copyEffectsOf,
  copySpan,
  copyWrite,
  type MinimalClipInfo,
} from "../../minimal-clip-info.ts";

/** One clip entry, and where it sits in the result so it can be replaced. */
interface ClipSlot {
  list: object[];
  index: number;
  /** The target the entry came from, in the order named */
  target: number;
  entry: MinimalClipInfo;
}

/**
 * Fixes the entry of every copy that is no longer where the result put it.
 *
 * Writing into an arrangement range clears what is there, and a copy already
 * made is as clearable as anything else: landing on one clears it, and landing
 * across its front re-creates the rest under a new id. Either way the id
 * already reported names nothing, so the entry loses its id or is pointed at
 * the rest, and says which landing did it.
 *
 * Each copy is checked by reading its id back, not by comparing the paths the
 * call reported: a copy can be cleared by one that starts somewhere else.
 * @param entries - The call's entries, one per target, mutated in place
 * @param shortened - The targets whose entries already say a later copy cut
 *   them short
 * @param lanes - The call's lanes, so finding what a landing left needs no scan
 */
export function reportOverwrittenCopies(
  entries: object[],
  shortened: ReadonlySet<number>,
  lanes?: LaneView,
): void {
  const slots = clipSlots(entries);

  // A lone copy has nothing in the call that could have buried it — which is
  // most calls, and they skip the read-back entirely.
  if (slots.length < 2) {
    return;
  }

  const gone = goneCopies(slots);
  const written = slots.flatMap(({ entry }) => copyWrite(entry) ?? []);
  const rests = claimRemainders({
    entries: gone.keys(),
    spanOf: ({ entry }) => copySpan(entry),
    written,
    taken: slots.filter((slot) => !gone.has(slot)).map(({ entry }) => entry.id),
    lanes,
  });
  const cutShort = (slot: ClipSlot): string =>
    cutShortDetail(writtenOverBy(copySpan(slot.entry), written));

  // A later copy can also cut the back off a copy, or split it: the id and the
  // path survive, so only the end gives it away.
  for (const slot of slots) {
    if (
      !gone.has(slot) &&
      !shortened.has(slot.target) &&
      endCutShort(slot.entry)
    ) {
      appendDetail(slot.entry, cutShort(slot));
    }
  }

  for (const slot of gone.keys()) {
    const rest = rests.get(slot);

    if (rest == null) {
      clearInPlace(slot.entry, writtenOverBy(copySpan(slot.entry), written));

      continue;
    }

    slot.entry.id = rest.clip.id;
    slot.entry.path = rest.path;

    if (!shortened.has(slot.target)) {
      appendDetail(slot.entry, cutShort(slot));
    }
  }
}

/**
 * Every clip a duplicate result reports, flattening the groups arrangement
 * tiling nests under `clips`. A copy that was cleared is left out — there is no
 * clip left to read or write.
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
 * What an entry says of a copy a later landing cut short.
 * @param by - Where the landing that did it put its clip, when that is known
 * @returns The detail
 */
function cutShortDetail(by: string | undefined): string {
  return by == null
    ? "shortened later in this call"
    : `shortened by ${by} later in this call`;
}

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
 * Whether a copy that is still where its entry put it now ends before it did.
 * @param entry - The copy's entry
 * @returns True when it was cut short at the back
 */
function endCutShort(entry: MinimalClipInfo): boolean {
  const landed = copySpan(entry);
  const end = LiveAPI.from(entry.id).getProperty("end_time");

  return (
    landed != null &&
    typeof end === "number" &&
    end < landed.end - SAME_TIME_EPSILON
  );
}

/**
 * Make an entry say its copy was cleared. Its other details described the clip
 * that is gone, but what it did to clips already on the lane still happened.
 * The entry is changed where it stands: the result already holds it.
 * @param entry - The copy's entry
 * @param by - Where the landing that cleared it put its clip, when known
 */
function clearInPlace(entry: MinimalClipInfo, by: string | undefined): void {
  const effects = copyEffectsOf(entry);
  const cleared =
    by == null
      ? "overwritten later in this call"
      : `overwritten later in this call by ${by}`;
  const loose = entry as Partial<MinimalClipInfo>;

  delete loose.id;
  delete loose.color;
  entry.detail = effects == null ? cleared : `${cleared}; ${effects}`;
}

/**
 * Finds every clip entry in a result, top-level or nested under `clips`.
 * @param entries - The call's entries, one per target
 * @returns One slot per clip entry
 */
function clipSlots(entries: object[]): ClipSlot[] {
  const slots: ClipSlot[] = [];

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] as object;

    if ("clips" in entry) {
      const { clips } = entry as { clips: object[] };

      for (let i = 0; i < clips.length; i++) {
        addSlot(slots, clips, i, index);
      }

      continue;
    }

    addSlot(slots, entries, index, index);
  }

  return slots;
}

/**
 * Adds one entry to the list, unless it names no clip — an entry already
 * replaced by a cleared marker has no id left.
 * @param slots - The slots collected so far
 * @param list - The array holding the entry
 * @param index - Where the entry sits in that array
 * @param target - The target the entry came from
 */
function addSlot(
  slots: ClipSlot[],
  list: object[],
  index: number,
  target: number,
): void {
  const entry = list[index];

  if (entry != null && "id" in entry) {
    slots.push({ list, index, target, entry: entry as MinimalClipInfo });
  }
}
