// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A conversion adds a track, which shifts the paths of every track after it, so
// a path an entry got earlier in the call can be stale by the end. Ids don't
// shift, so the paths are read again once the call is done.

import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * Read the paths on the written entries again, and on what they converted.
 * @param entries - The entries the call wrote, and their pieces
 */
export function refreshPathsAfterConvert(entries: readonly ClipResult[]): void {
  for (const entry of entries) {
    refresh(entry, entry.id);

    if (entry.converted != null) {
      refresh(entry.converted.track, entry.converted.track.id);

      if (entry.converted.clip != null) {
        refresh(entry.converted.clip, entry.converted.clip.id);
      }
    }
  }
}

/**
 * Put an object's current path on it, keeping the old one when it has none.
 * @param target - The entry, track or clip, changed in place
 * @param id - Its id
 */
function refresh(target: { path?: string }, id: string | undefined): void {
  if (id != null) {
    target.path = objectPathForApi(LiveAPI.from(id)) ?? target.path;
  }
}
