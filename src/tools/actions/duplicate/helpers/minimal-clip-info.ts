// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The clip shape every duplicate result reports a copy with.

import { errorMessage } from "#src/shared/error-message.ts";
import {
  type LandedSpan,
  nextLandingOrder,
  wholeLaneWrite,
} from "#src/tools/shared/arrangement/helpers/clip-remainders.ts";
import {
  appendDetail,
  type EntryWithDetail,
  joinDetails,
} from "#src/tools/shared/helpers/entry-details.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  objectPathForApi,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";

// Where each arrangement copy sat when it landed, read while its id still
// lives. A later copy covering only its front re-creates the rest under a new
// id, and the span is what finds that rest. Keyed by the entry, so it lives as
// long as the call's result.
const copySpans = new WeakMap<object, LandedSpan>();
// A copy whose span couldn't be read still cleared something on its lane.
const unknownWrites = new WeakMap<object, LandedSpan>();
// What each copy did to the clips already on its lane. It stays true when a
// later copy buries the copy itself, so the entry that replaces it keeps it.
const copyEffects = new WeakMap<object, string>();

export interface MinimalClipInfo {
  id: string;
  /** Where the clip is: "t0/s3" in the session, "t0[5|1]" or "t0/l0[5|1]" in
   * the arrangement. Pastes straight back into any path/toPath param. */
  path?: string;
  noteCount?: number;
  transformed?: number;
  /** Notes the copy's transforms removed. */
  deletedNotes?: number;
  /** The scenes the destination had to make ("s8-s9"), when it made any. */
  created?: string;
  /** Why the copy isn't quite what was asked for, when it isn't. */
  detail?: string;
}

/**
 * Get minimal clip information for result objects. Pass the detail here
 * rather than copying the entry to add one: a copy loses the span recorded
 * for it.
 * @param clip - The clip to get info from
 * @param detail - Why the copy isn't quite what was asked for, if it isn't
 * @returns Minimal clip info object
 */
export function getMinimalClipInfo(
  clip: LiveAPI,
  detail?: string,
): MinimalClipInfo {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (isArrangementClip) {
    if (clip.trackIndex == null) {
      throw new Error(`no track for arrangement clip ${targetLabel(clip)}`);
    }

    // The path spells the lane and the start, so nothing else reports either.
    const entry = {
      id: clip.id,
      path: objectPathForApi(clip),
      ...(detail != null && { detail }),
    };

    recordCopySpan(entry, clip, clip.trackIndex);

    return entry;
  }

  const trackIndex = clip.trackIndex;
  const sceneIndex = clip.sceneIndex;

  if (trackIndex == null || sceneIndex == null) {
    throw new Error(`no clip slot for clip ${targetLabel(clip)}`);
  }

  return {
    id: clip.id,
    path: slotPath(trackIndex, sceneIndex),
    ...(detail != null && { detail }),
  };
}

/**
 * Names, colors and reports a copy that already exists. A failure here can't
 * unmake the copy, so it goes in the copy's own entry instead of being thrown.
 * @param copy - The copy Live made
 * @param name - Name for it, if any
 * @param color - Color for it, if any
 * @returns The copy's entry, with what failed in its detail
 */
export function finishCopy(
  copy: LiveAPI,
  name: string | undefined,
  color: string | undefined,
): MinimalClipInfo {
  const failures: string[] = [];

  try {
    copy.setAll({ name, color });
  } catch (error) {
    failures.push(`name and color not applied: ${errorMessage(error)}`);
  }

  return readCopyBack(copy, () => joinDetails(failures));
}

/**
 * The entry for a copy that already exists. A failure reading it back can't
 * unmake it, so the entry keeps its id and says what failed instead of the
 * copy being reported as refused.
 * @param copy - The copy Live made
 * @param detail - What to say about the copy, built once it is known to exist
 * @returns The copy's entry
 */
export function readCopyBack(
  copy: LiveAPI,
  detail: () => string | undefined,
): MinimalClipInfo {
  let said: string | undefined;

  try {
    said = detail();

    return getMinimalClipInfo(copy, said);
  } catch (error) {
    // The id is all that can still be read.
    return {
      id: copy.id,
      detail: joinDetails([
        said,
        `couldn't read the copy back: ${errorMessage(error)}`,
      ]),
    };
  }
}

/**
 * Where an arrangement copy sat when it landed.
 * @param entry - The copy's result entry
 * @returns Its lane, span and landing order, or undefined for a session copy
 */
export function copySpan(entry: object): LandedSpan | undefined {
  return copySpans.get(entry);
}

/**
 * What an arrangement copy wrote: its span, or the whole lane when that span
 * couldn't be read.
 * @param entry - The copy's result entry
 * @returns The span, or undefined for a session copy
 */
export function copyWrite(entry: object): LandedSpan | undefined {
  return copySpans.get(entry) ?? unknownWrites.get(entry);
}

/**
 * Say on a copy's entry what it did to the clips already on its lane.
 * @param entry - The copy's result entry
 * @param effects - What it overwrote, shortened or split
 */
export function noteCopyEffects(entry: EntryWithDetail, effects: string): void {
  appendDetail(entry, effects);
  copyEffects.set(entry, effects);
}

/**
 * What a copy did to the clips already on its lane, as it said so.
 * @param entry - The copy's result entry
 * @returns The effects, or undefined when it had none
 */
export function copyEffectsOf(entry: object): string | undefined {
  return copyEffects.get(entry);
}

/**
 * The entry a destination no copy landed at keeps in the result, so a call
 * naming N destinations still answers with N entries.
 * @param path - The destination, as the path a copy there would report
 * @param detail - Why no copy landed, in the words a single one would throw
 * @returns The skip entry
 */
export function skippedCopy(path: string, detail: string): TargetSkip {
  return { path, ok: false, detail };
}

/** A destination Live made no copy at, after its landing cleared clips. */
export interface ClearedCopy {
  path?: string;
  detail: string;
}

/**
 * The entry a destination keeps when Live made no copy but its landing had
 * already cleared clips: the Set changed, so it is not a skip (no `ok: false`),
 * and the detail says what was cleared.
 * @param path - The destination, as the path a copy there would report
 * @param detail - Why no copy landed, and what the landing cleared
 * @returns The entry
 */
export function clearedCopy(
  path: string | undefined,
  detail: string,
): ClearedCopy {
  return { path, detail };
}

/**
 * Remember where an arrangement copy sits, for its entry.
 * @param entry - The copy's result entry
 * @param clip - The copy
 * @param trackIndex - The track it landed on
 */
function recordCopySpan(
  entry: object,
  clip: LiveAPI,
  trackIndex: number,
): void {
  const start = clip.getProperty("start_time");
  const end = clip.getProperty("end_time");

  const laneIndex = clip.takeLaneIndex;
  const lane: ArrangementLane =
    laneIndex == null
      ? { kind: "track", trackIndex }
      : { kind: "take-lane", trackIndex, laneIndex };

  if (typeof start !== "number" || typeof end !== "number" || end <= start) {
    unknownWrites.set(entry, wholeLaneWrite(lane));

    return;
  }

  copySpans.set(entry, {
    lane,
    start,
    end,
    order: nextLandingOrder(),
  });
}
