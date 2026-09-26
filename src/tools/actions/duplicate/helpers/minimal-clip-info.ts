// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The clip shape every duplicate result reports a copy with.

import {
  type LandedSpan,
  nextLandingOrder,
  wholeLaneWrite,
} from "#src/tools/shared/arrangement/helpers/clip-remainders.ts";
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

export interface MinimalClipInfo {
  id: string;
  /** Where the clip is: "t0/s3" in the session, "t0[5|1]" or "t0/l0[5|1]" in
   * the arrangement. Pastes straight back into any path/toPath param. */
  path?: string;
  noteCount?: number;
  transformed?: number;
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
 * The entry a destination no copy landed at keeps in the result, so a call
 * naming N destinations still answers with N entries (ADR-0042).
 * @param path - The destination, as the path a copy there would report
 * @param detail - Why no copy landed, in the words a single one would throw
 * @returns The skip entry
 */
export function skippedCopy(path: string, detail: string): TargetSkip {
  return { path, ok: false, detail };
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
