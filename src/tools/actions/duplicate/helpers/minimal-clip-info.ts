// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The clip shape every duplicate result reports a copy with.

import { slotPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";

export interface MinimalClipInfo {
  id: string;
  /** Where the clip is: "t0/s3" in the session, "t0[5|1]" or "t0/l0[5|1]" in
   * the arrangement. Pastes straight back into any path/toPath param. */
  path?: string;
  noteCount?: number;
  transformed?: number;
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
      throw new Error(
        `could not determine trackIndex for clip (path="${clip.path}")`,
      );
    }

    // The path spells the lane and the start, so nothing else reports either.
    return { id: clip.id, path: objectPathForApi(clip) };
  }

  const trackIndex = clip.trackIndex;
  const sceneIndex = clip.sceneIndex;

  if (trackIndex == null || sceneIndex == null) {
    throw new Error(
      `could not determine trackIndex/sceneIndex for clip (path="${clip.path}")`,
    );
  }

  return { id: clip.id, path: slotPath(trackIndex, sceneIndex) };
}
