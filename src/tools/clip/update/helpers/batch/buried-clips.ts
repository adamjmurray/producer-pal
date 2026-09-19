// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a batch's result says about a clip another clip in the same call landed
// on top of: the move ordering avoids that where it can, but a take-lane
// destination never enters its graph and two clips sent to one spot must stack.
// Read the path, never `exists()` — a held object keeps reporting its id after
// its target dies, and only the path clears (dev/LiveAPI-Object-Reuse.md).

import {
  buildClipResultObject,
  type ClipResult,
} from "#src/tools/clip/helpers/clip-results.ts";
import {
  objectPathForApi,
  stillAtPath,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { appendReason } from "../entries/clip-reasons.ts";
import { remainderFinder, type TrimmedLanding } from "./trimmed-landings.ts";

/** Where each clip sat before the call moved any of them, by id. */
export type ClipAddresses = ReadonlyMap<string, string | undefined>;

/** What became of a clip another clip in the call was moved onto. */
const BURIED = "another clip in this call was moved onto it";

/** What became of a clip a shorter landing only covered the front of. */
const TRIMMED = "trimmed: another clip in this call landed on its start";

/** What the batch has to check its entries against. */
export interface BuriedClipsCheck {
  /** The call's clip entries, marked in place. */
  results: ClipResult[];
  /** Whether the call writes anywhere a clip could be sitting. */
  clearsSpans: boolean;
  /** Clips the call clears once their own overwrite has landed. */
  heldBack: ReadonlySet<string> | undefined;
  /** Where a landing a later one trimmed left its remainder, by entry id. */
  trims: ReadonlyMap<string, TrimmedLanding>;
}

/**
 * Mark every entry whose clip is no longer where the result put it. Checked by
 * reading each id back, not by comparing the paths the call reported: a clip
 * can be cleared by one that starts somewhere else.
 * @param check - The entries and what the call's moves did
 * @param check.results - The call's clip entries, marked in place
 * @param check.clearsSpans - Whether the call writes anywhere a clip could sit
 * @param check.heldBack - Clips the call clears once their overwrite has landed
 * @param check.trims - Where a trimmed landing left its remainder, by entry id
 */
export function markBuriedClips({
  results,
  clearsSpans,
  heldBack,
  trims,
}: BuriedClipsCheck): void {
  // The read-back costs a look-up per entry, so most calls skip it: one that
  // clears nothing buries nothing, and a lone entry has no sibling.
  if (!clearsSpans || results.length < 2) {
    return;
  }

  const findRemainder = remainderFinder();

  for (const entry of results) {
    const { path } = entry;

    // Skip the entries that already say what became of their clip: one the
    // batch found gone before its turn, and one the flush settles after this.
    if (
      path == null ||
      entry.deleted != null ||
      heldBack?.has(entry.id) ||
      stillAtPath(entry.id, path)
    ) {
      continue;
    }

    // Gone from where it was doesn't mean gone: a shorter landing takes only
    // the front off, which re-creates the rest under a new id.
    if (reportTrimmedSurvivor(entry, trims.get(entry.id), findRemainder)) {
      continue;
    }

    entry.deleted = true;
    appendReason(entry, BURIED);
  }
}

/**
 * Point an entry at what is left of its clip, when a later landing took only
 * the front off it. The trim re-creates the clip, so the id the entry reported
 * is gone either way — finding the remainder where the trim would have left it
 * is what tells a survivor from a buried clip.
 * @param entry - The entry whose clip is no longer where it was
 * @param trim - What a trim would have left, or undefined for no trim
 * @param findRemainder - Looks the remainder up on its lane
 * @returns True when the remainder is there and the entry now names it
 */
function reportTrimmedSurvivor(
  entry: ClipResult,
  trim: TrimmedLanding | undefined,
  findRemainder: (trim: TrimmedLanding) => LiveAPI | null,
): boolean {
  if (trim == null) {
    return false;
  }

  const remainder = findRemainder(trim);
  const path = remainder == null ? null : objectPathForApi(remainder);

  if (remainder == null || path == null) {
    return false;
  }

  entry.id = remainder.id;
  entry.path = path;
  appendReason(entry, TRIMMED);

  return true;
}

/**
 * Where the call's clips sit now, so one it later finds gone can still be named
 * by the address it had. Empty when nothing can bury a clip: the read costs a
 * `start_time` apiece.
 * @param clips - The clips to update
 * @param clearsSpans - Whether the call writes anywhere a clip could be sitting
 * @returns The address of each clip, by id
 */
export function clipAddresses(
  clips: LiveAPI[],
  clearsSpans: boolean,
): ClipAddresses {
  const addresses = new Map<string, string | undefined>();

  if (!clearsSpans || clips.length < 2) {
    return addresses;
  }

  for (const clip of clips) {
    addresses.set(clip.id, objectPathForApi(clip));
  }

  return addresses;
}

/**
 * The entry for a clip that was already gone when its turn came, or null when
 * it is still there. Without it the batch describes a dead object: every
 * property read dries up, so it reads as a session clip.
 * @param clip - The clip whose turn it is
 * @param addresses - Where each clip sat before any of them moved
 * @returns Its entry, or null when the clip is still there
 */
export function buriedClipEntry(
  clip: LiveAPI,
  addresses: ClipAddresses,
): ClipResult | null {
  if (!clipIsGone(clip)) {
    return null;
  }

  const entry = buildClipResultObject(clip.id, null, addresses.get(clip.id));

  entry.deleted = true;
  appendReason(entry, `not updated: ${BURIED}`);

  return entry;
}

/**
 * Whether a clip this call is holding has been destroyed since it was resolved.
 * @param clip - The clip the call is holding
 * @returns True when it is gone
 */
export function clipIsGone(clip: LiveAPI): boolean {
  return !clip.path;
}
