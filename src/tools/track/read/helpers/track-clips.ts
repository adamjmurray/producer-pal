// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type Notation } from "#src/shared/notation.ts";
import {
  readOneClip,
  type ReadClipResult,
} from "#src/tools/clip/read/read-clip.ts";
import { stripFields } from "#src/tools/shared/helpers/live-api-values.ts";
import { arrangementPath } from "#src/tools/shared/validation/helpers/object-paths.ts";

/** A non-main take lane with its name and arrangement clips */
export interface ReadTakeLaneResult {
  /** The lane's path ("t0/l0"), which pastes back into any path/toPath param.
   * Saves a consumer inferring the index from array position. */
  path: string;
  name: string;
  clips: ReadClipResult[];
}

/**
 * Read all session clips from a track
 * @param track - Track object
 * @param trackIndex - Track index
 * @param isDrumMode - Whether nested clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested reads
 * @param notation - Active notation for nested clip note formatting
 * @returns Array of clip objects (only clips that exist)
 */
export function readSessionClips(
  track: LiveAPI,
  trackIndex: number | null,
  isDrumMode: () => boolean,
  include?: string[],
  notation?: Notation,
): ReadClipResult[] {
  const drumMode = isDrumMode();

  return track
    .getChildIds("clip_slots")
    .map((_clipSlotId, sceneIndex) =>
      readOneClip(
        {
          trackIndex,
          sceneIndex,
          suppressEmptyWarning: true,
          slotValidated: true,
          drumMode,
          ...(include && { include }),
        },
        { notation },
      ),
    )
    .filter((clip) => clip.id != null);
}

/**
 * Count session clips in a track (faster than reading full clip details)
 * @param track - Track object
 * @param trackIndex - Track index
 * @returns Number of clips
 */
export function countSessionClips(
  track: LiveAPI,
  trackIndex: number | null,
): number {
  return track
    .getChildIds("clip_slots")
    .map((_clipSlotId, sceneIndex) => {
      const clip = LiveAPI.from(
        livePath
          .track(trackIndex as number)
          .clipSlot(sceneIndex)
          .clip(),
      );

      return clip.exists() ? clip : null;
    })
    .filter(Boolean).length;
}

/**
 * Read all arrangement clips from a track
 * @param track - Track object
 * @param isDrumMode - Whether nested clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested reads
 * @param notation - Active notation for nested clip note formatting
 * @returns Array of clip objects (only clips that exist)
 */
export function readArrangementClips(
  track: LiveAPI,
  isDrumMode: () => boolean,
  include?: string[],
  notation?: Notation,
): ReadClipResult[] {
  const drumMode = isDrumMode();

  return track
    .getChildIds("arrangement_clips")
    .map((clipId) =>
      readOneClip(
        {
          id: clipId,
          drumMode,
          ...(include && { include }),
        },
        { notation },
      ),
    )
    .filter((clip) => clip.id != null);
}

/**
 * Count arrangement clips in a track
 * @param track - Track object
 * @returns Number of clips
 */
export function countArrangementClips(track: LiveAPI): number {
  return track.getChildIds("arrangement_clips").length;
}

/**
 * Read all non-main take lanes from a track. Take lanes are arrangement-only
 * and the main lane is not included in the track's take_lanes collection.
 * @param track - Track object
 * @param trackIndex - Track index, for the lane paths
 * @param isDrumMode - Whether nested clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested clip reads
 * @param notation - Active notation for nested clip note formatting
 * @returns Array of take lanes, each with its name and arrangement clips
 */
export function readTakeLanes(
  track: LiveAPI,
  trackIndex: number | null,
  isDrumMode: () => boolean,
  include?: string[],
  notation?: Notation,
): ReadTakeLaneResult[] {
  const drumMode = isDrumMode();

  return track.getChildren("take_lanes").map((lane, i) => {
    const clips = lane
      .getChildIds("arrangement_clips")
      .map((clipId) =>
        readOneClip(
          { id: clipId, drumMode, ...(include && { include }) },
          { notation },
        ),
      )
      .filter((clip) => clip.id != null);

    // Strip fields redundant with the parent context: a take lane clip is
    // always an arrangement clip on this track, matching its MIDI/audio type.
    // The path stays — it carries where the clip starts, which the lane's own
    // path doesn't say.
    stripFields(clips, "view", "type");

    return {
      path: arrangementPath(trackIndex as number, i),
      name: lane.getName(),
      clips,
    };
  });
}
