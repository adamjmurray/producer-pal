// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The clip shape every duplicate result reports a copy with.

import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  objectPathForApi,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";

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
 * Get minimal clip information for result objects
 * @param clip - The clip to get info from
 * @returns Minimal clip info object
 */
export function getMinimalClipInfo(clip: LiveAPI): MinimalClipInfo {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (isArrangementClip) {
    if (clip.trackIndex == null) {
      throw new Error(`no track for arrangement clip ${targetLabel(clip)}`);
    }

    // The path spells the lane and the start, so nothing else reports either.
    return { id: clip.id, path: objectPathForApi(clip) };
  }

  const trackIndex = clip.trackIndex;
  const sceneIndex = clip.sceneIndex;

  if (trackIndex == null || sceneIndex == null) {
    throw new Error(`no clip slot for clip ${targetLabel(clip)}`);
  }

  return { id: clip.id, path: slotPath(trackIndex, sceneIndex) };
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
