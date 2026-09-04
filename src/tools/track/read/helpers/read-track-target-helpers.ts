// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type ReturnTrackInfo } from "#src/tools/shared/sends/return-track-info.ts";
import { namedIdParam, namedParam } from "#src/tools/shared/utils.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { trackApiAtPath } from "#src/tools/shared/validation/path-target-lookup.ts";

export interface ReadTrackArgs {
  trackIndex?: number;
  id?: string;
  path?: string;
  /** Hidden alias for id */
  trackId?: string;
  trackType?: string;
  /** The Live Set's return tracks, when the caller already read them */
  returnTracks?: ReturnTrackInfo[];
  include?: string[];
  /**
   * Session clips on this track, when the caller already knows. A Live Set read
   * counts every clip slot for its scenes anyway, and counting again here
   * would build the whole grid a second time.
   */
  sessionClipCount?: number;
}

export interface ReadTrackTarget {
  track: LiveAPI;
  /** "regular", "return", or "master" */
  category: string;
  /** Index within the category, or null for the main track */
  trackIndex: number | null;
}

/**
 * The track a read is about, from whichever way the caller named it.
 * @param args - The read's parameters
 * @returns The track, plus the category and index it turned out to be
 */
export function resolveReadTrackTarget(args: ReadTrackArgs): ReadTrackTarget {
  const { trackIndex, trackType } = args;
  const trackId = namedIdParam(args.id, args.trackId, "trackId");
  const path = namedParam(args.path, "path");
  const category = trackType ?? "regular";

  if (
    trackId == null &&
    path == null &&
    trackIndex == null &&
    category !== "master"
  ) {
    throw new Error("id or path is required");
  }

  if (path != null && (trackId != null || trackIndex != null)) {
    throw new Error(
      "path names the track on its own - don't send id or trackIndex with it",
    );
  }

  if (trackId != null || path != null) {
    // An id has to be checked; a path already said what kind of thing it names
    const track =
      trackId != null
        ? validateIdType(trackId, "track")
        : trackApiAtPath(path as string);

    return {
      track,
      // The object itself says where it sits, whatever the caller asked for
      category: (track.category as string | undefined) ?? "regular",
      trackIndex: track.trackIndex ?? track.returnTrackIndex ?? null,
    };
  }

  return {
    track: trackByIndex(category, trackIndex, trackType),
    category,
    trackIndex: trackIndex ?? null,
  };
}

// --- Helpers below main exports ---

/**
 * The track at an index within a category.
 * @param category - "regular", "return", or "master"
 * @param trackIndex - Index within the category, unused for the main track
 * @param trackType - The raw param, for the error naming an unknown category
 * @returns The track it names
 */
function trackByIndex(
  category: string,
  trackIndex: number | undefined,
  trackType: string | undefined,
): LiveAPI {
  // trackIndex is non-null for the two indexed categories: the check above
  // only lets it through unset for "master".
  switch (category) {
    case "regular":
      return LiveAPI.from(livePath.track(trackIndex as number));
    case "return":
      return LiveAPI.from(livePath.returnTrack(trackIndex as number));
    case "master":
      return LiveAPI.from(livePath.masterTrack());
    default:
      throw new Error(
        `Invalid trackType: ${trackType}. Must be "regular", "return", or "master".`,
      );
  }
}
