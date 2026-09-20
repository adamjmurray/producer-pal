// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type Notation } from "#src/shared/notation.ts";
import {
  readOneClip,
  type ReadClipArgs,
  type ReadClipResult,
} from "#src/tools/clip/read/read-clip.ts";
import { stripFields } from "#src/tools/shared/helpers/live-api-values.ts";
import { arrangementPath } from "#src/tools/shared/validation/helpers/object-paths.ts";

/** A non-main take lane with its name and arrangement clips */
export interface ReadTakeLaneResult {
  id: string;
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

  return readClips(
    track.getChildIds("clip_slots"),
    (_clipSlotId, sceneIndex) => ({
      trackIndex,
      sceneIndex,
      slotValidated: true,
      drumMode,
      ...(include && { include }),
    }),
    notation,
  );
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
  return readArrangementClipsOf(track, isDrumMode(), include, notation);
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

  return track.getChildren("take_lanes").map((lane, i) => ({
    id: lane.id,
    path: arrangementPath(trackIndex as number, i),
    name: lane.getName(),
    clips: readTakeLaneClips(lane, drumMode, include, notation),
  }));
}

/**
 * Read the arrangement clips on one take lane.
 * @param lane - The take lane object
 * @param drumMode - Whether the clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested clip reads
 * @param notation - Active notation for nested clip note formatting
 * @returns The clips on the lane
 */
export function readTakeLaneClips(
  lane: LiveAPI,
  drumMode: boolean,
  include?: string[],
  notation?: Notation,
): ReadClipResult[] {
  const clips = readArrangementClipsOf(lane, drumMode, include, notation);

  // Strip fields redundant with the parent context: a take lane clip is always
  // an arrangement clip on this track, matching its MIDI/audio type. The path
  // stays — it carries where the clip starts, which the lane's own path doesn't.
  stripFields(clips, "view", "type");

  return clips;
}

/**
 * Read the arrangement clips of a track or take lane.
 * @param owner - The track or take lane holding the clips
 * @param drumMode - Whether the clip reads use drum mode (see drumModeForTrack)
 * @param include - Include array for nested clip reads
 * @param notation - Active notation for nested clip note formatting
 * @returns The clips that exist, in order
 */
function readArrangementClipsOf(
  owner: LiveAPI,
  drumMode: boolean,
  include?: string[],
  notation?: Notation,
): ReadClipResult[] {
  return readClips(
    owner.getChildIds("arrangement_clips"),
    (clipId) => ({ id: clipId, drumMode, ...(include && { include }) }),
    notation,
  );
}

/**
 * Read a collection's clips, dropping the slots that hold none.
 * @param clipIds - The collection's child ids
 * @param argsFor - The read args for one clip, by id and position
 * @param notation - Active notation for nested clip note formatting
 * @returns The clips that exist, in order
 */
function readClips(
  clipIds: string[],
  argsFor: (clipId: string, index: number) => ReadClipArgs,
  notation?: Notation,
): ReadClipResult[] {
  return clipIds
    .map((clipId, index) => readOneClip(argsFor(clipId, index), { notation }))
    .filter((clip) => clip.id != null);
}
