// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a batch's result says about a clip another clip in the same call landed
// on top of: the move ordering avoids that where it can, but a take-lane
// destination never enters its graph and two clips sent to one spot must stack.
// Read the path, never `exists()` — a held object keeps reporting its id after
// its target dies, and only the path clears (dev/live-api/object-reuse.md).

import {
  buildClipResultObject,
  type ClipResult,
} from "#src/tools/clip/helpers/clip-results.ts";
import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import { songMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import {
  objectPathForApi,
  stillAtPath,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import {
  claimRemainders,
  type LandedSpan,
  type Remainder,
} from "#src/tools/shared/arrangement/helpers/clip-remainders.ts";

/** Where each clip sat before the call moved any of them, by id. */
export type ClipAddresses = ReadonlyMap<string, string | undefined>;

/** What became of a clip another clip in the call was moved onto. */
export const BURIED = "another clip in this call was moved onto it";

/** What became of a clip a later landing covered only part of. */
const TRIMMED = "trimmed: another clip in this call landed on part of it";

/** What the batch has to check its entries against. */
export interface BuriedClipsCheck {
  /** The call's clip entries, marked in place. */
  results: ClipResult[];
  /** Whether the call writes anywhere a clip could be sitting. */
  clearsSpans: boolean;
  /** Clips the call clears once their own overwrite has landed. */
  heldBack: ReadonlySet<string> | undefined;
  /** Where and when each copy the call landed landed, by entry id. */
  landed: ReadonlyMap<string, LandedSpan>;
  /** Every span the call wrote, whoever's clip it holds. */
  written: readonly LandedSpan[];
}

/**
 * Mark every entry whose clip is no longer where the result put it. Checked by
 * reading each id back, not by comparing the paths the call reported: a clip
 * can be cleared by one that starts somewhere else.
 * @param check - The entries and what the call's moves did
 * @param check.results - The call's clip entries, marked in place
 * @param check.clearsSpans - Whether the call writes anywhere a clip could sit
 * @param check.heldBack - Clips the call clears once their overwrite has landed
 * @param check.landed - Where and when each landed copy landed, by entry id
 * @param check.written - Every span the call wrote
 */
export function markBuriedClips({
  results,
  clearsSpans,
  heldBack,
  landed,
  written,
}: BuriedClipsCheck): void {
  // The read-back costs a look-up per entry, so most calls skip it: one that
  // clears nothing buries nothing, and a lone entry has no sibling.
  if (!clearsSpans || results.length < 2) {
    return;
  }

  // Skip the entries that already say what became of their clip: one the
  // batch found gone before its turn, and one the flush settles after this.
  const gone = results.filter(
    ({ id, path, deleted }) =>
      path != null &&
      deleted == null &&
      !heldBack?.has(id) &&
      !stillAtPath(id, path),
  );
  const goneSet = new Set(gone);
  // Gone from where it was doesn't mean gone: a later landing that takes only
  // part of it re-creates the rest under a new id.
  const remainders = claimRemainders({
    entries: gone,
    spanOf: (entry) => landed.get(entry.id),
    written,
    taken: results.filter((entry) => !goneSet.has(entry)).map(({ id }) => id),
  });

  for (const entry of gone) {
    const remainder = remainders.get(entry);

    if (remainder != null) {
      reportTrimmedSurvivor(entry, remainder);
      continue;
    }

    entry.deleted = true;
    appendDetail(entry, BURIED);
  }
}

/**
 * Point an entry at what is left of its clip.
 * @param entry - The entry whose clip is no longer where it was
 * @param remainder - What the trim left, and where
 */
function reportTrimmedSurvivor(entry: ClipResult, remainder: Remainder): void {
  entry.id = remainder.clip.id;
  entry.path = remainder.path;
  entry.arrangementLength = arrangementLengthOf(remainder.clip);
  appendDetail(entry, TRIMMED);
}

/**
 * How much of the arrangement a clip covers, as read-clip reports it.
 * @param clip - The clip to measure
 * @returns Its span as a duration
 */
function arrangementLengthOf(clip: LiveAPI): string {
  const start = clip.getProperty("start_time") as number;
  const end = clip.getProperty("end_time") as number;
  const { numerator, denominator } = songMeter();

  return abletonBeatsToDuration(end - start, numerator, denominator);
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
  appendDetail(entry, `not updated: ${BURIED}`);

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
