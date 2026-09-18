// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a take-lane copy reads from: a track's main lane, or a take lane of its
// own. Only a lane destination takes a lane source, so `t2/l0` names the lane
// here and the track everywhere else a track copy looks.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  isTakeLaneClip,
  takeLaneById,
  takeLaneLabel,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { canRecreateClip } from "#src/tools/shared/clip/recreate-clip.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import {
  existingId,
  idPerPath,
  type IdLookup,
} from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import {
  pathEntries,
  takeLanePathEntry,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  pathPrefix,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { trackIdAtPath } from "#src/tools/shared/validation/path-target-lookup.ts";

/** What one source contributes to every destination it names. */
export interface LaneSource {
  clips: LiveAPI[];
  /** Whether any clip can be rebuilt at all: an audio one needs its sample. */
  recreatable: boolean;
  isMidi: boolean;
  /** How the source is addressed, for a refusal that names it */
  label: string;
  /** The lane's own path when the source is a lane, so a copy onto itself can
   * be refused. */
  lanePath?: string;
}

/** What a lane source can't be copied onto. */
const LANE_NEEDS_LANE =
  'its clips copy only onto another lane, as toPath "t3/l0" or "t3/l+"';

/**
 * The clips one source hands to every destination it names, and what they can
 * land on.
 * @param id - The source's id, a track's or a take lane's
 * @returns The source's clips, type and label
 * @throws Error when the id names neither a track nor a take lane
 */
export function laneSource(id: string): LaneSource {
  const lane = takeLaneById(id);

  if (lane == null) {
    const track = validateIdType(id, "track");

    return sourceOfClips(
      arrangementClipsOf(track, false),
      track,
      targetLabel(track),
    );
  }

  const trackIndex = lane.trackIndex as number;
  const label = takeLaneLabel({
    trackIndex,
    takeLane: lane.takeLaneIndex,
  });

  return {
    ...sourceOfClips(
      arrangementClipsOf(lane, true),
      LiveAPI.from(livePath.track(trackIndex)),
      label,
    ),
    lanePath: label,
  };
}

/**
 * The ids a lane copy's `path` names: a lane path names the lane, and
 * everything else the track it always named.
 * @param paths - Comma-separated source paths
 * @returns One id per entry, in order, null where an entry named none
 * @throws Error when an entry appends a lane rather than naming one
 */
export function laneSourceIds(paths: string): Array<string | null> {
  const entries = pathEntries(paths, "path");

  for (const entry of entries) {
    refuseAppendedLane(entry);
  }

  return idPerPath(paths, "path", laneOrTrackIdAtPath);
}

/**
 * Refuses a take-lane source whose destination isn't a lane, before anything
 * is copied. A lane holds clips and nothing else, so it can't stand in for the
 * track a new-track copy needs.
 * @param type - What is being duplicated
 * @param toTakeLane - Whether the destination names a take lane
 * @param id - Source id(s), as the caller wrote them
 * @param path - Source path(s), as the caller wrote them
 * @throws Error when a source names a lane and the destination doesn't
 */
export function refuseLaneSourceOffLane(
  type: string,
  toTakeLane: boolean,
  id: string | undefined,
  path: string | undefined,
): void {
  if (type !== "track" || toTakeLane) {
    return;
  }

  const paths = pathEntries(path, "path");

  for (const entry of paths) {
    if (takeLanePathEntry(entry)?.kind === "take-lane") {
      throw new Error(`path "${entry}" names a take lane; ${LANE_NEEDS_LANE}`);
    }
  }

  for (const entry of targetEntries(id, "id")) {
    const lane = takeLaneById(entry);

    if (lane != null) {
      throw new Error(
        `id "${entry}" names take lane ${pathPrefix(lane)}; ${LANE_NEEDS_LANE}`,
      );
    }
  }
}

// --- Helpers below main exports ---

/**
 * Refuses a source that appends a lane. `l+` makes a lane, which is empty, so
 * it names nothing to copy from.
 * @param entry - One path, as the caller wrote it
 * @throws Error when the entry appends a take lane
 */
function refuseAppendedLane(entry: string): void {
  if (takeLanePathEntry(entry)?.kind !== "new-take-lane") {
    return;
  }

  throw new Error(
    `path "${entry}" appends a take lane; copy from one that ` +
      `already holds clips, as "t2/l0"`,
  );
}

/**
 * One source, from the clips it holds and the track they belong to.
 * @param clips - The clips to copy, in order
 * @param track - The track the clips sit on, which decides MIDI or audio
 * @param label - How the source is addressed
 * @returns The source
 */
function sourceOfClips(
  clips: LiveAPI[],
  track: LiveAPI,
  label: string,
): LaneSource {
  return {
    clips,
    recreatable: clips.some(canRecreateClip),
    // A lane has no type of its own: its clips are the track's.
    isMidi: (track.getProperty("has_midi_input") as number) > 0,
    label,
  };
}

/**
 * The id one source path names: the take lane, or the track.
 * @param entry - One path, as the caller wrote it
 * @param label - Param name the path came from, for the reason
 * @returns The id, or why there isn't one
 */
function laneOrTrackIdAtPath(entry: string, label = "path"): IdLookup {
  const path = takeLanePathEntry(entry);

  // An `l+` is refused before any of this, so a lane path names an index.
  if (path?.kind !== "take-lane") {
    return trackIdAtPath(entry, label);
  }

  const lane = LiveAPI.from(livePath.track(path.trackIndex)).child(
    "take_lanes",
    String(path.laneIndex),
  );

  return existingId(lane, { noun: "take lane", label, entry });
}

/**
 * The arrangement clips a source holds. A lane's are all its own; whether
 * Live's `arrangement_clips` takes in the lanes' clips on a track that has
 * lanes isn't settled here, so a track's take-lane paths are filtered out.
 * @param owner - The source track or take lane
 * @param ofLane - Whether the owner is the lane itself
 * @returns Its clips, in order
 */
function arrangementClipsOf(owner: LiveAPI, ofLane: boolean): LiveAPI[] {
  return owner
    .getChildIds("arrangement_clips")
    .map((id) => LiveAPI.from(id))
    .filter((clip) => clip.exists() && (ofLane || !isTakeLaneClip(clip)));
}
