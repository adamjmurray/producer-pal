// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading one take lane, for a read-track call that names a lane rather than a
// track — by path, or by the lane's own id. The clips come with the same
// include that lists a track's lanes.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type Notation } from "#src/shared/notation.ts";
import {
  assertTrackTakesLanes,
  takeLaneById,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { paramNamesSomething } from "#src/tools/shared/helpers/param-presence.ts";
import {
  expandWildcardIncludes,
  parseIncludeArray,
  READ_TRACK_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import {
  NEW_TAKE_LANE_ADVICE,
  pathError,
} from "#src/tools/shared/validation/helpers/object-path-lexer.ts";
import {
  takeLanePathEntry,
  type TakeLanePath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type ReadTrackArgs } from "./read-track-targets.ts";
import { readTakeLaneClips } from "./track-clips.ts";
import { drumModeForTrack } from "./track-optional-fields.ts";

/** The take lane a read names: the object an id found, or the path it spells. */
export type TakeLaneTarget =
  | { from: "id"; lane: LiveAPI }
  | { from: "path"; path: TakeLanePath; entry: string };

/** A lane a read reached, and the track it sits on when that was resolved. */
interface LocatedLane {
  lane: LiveAPI;
  track: LiveAPI | null;
}

/**
 * The take lane a read names, if it names one. A path sent beside an id or a
 * track index names two targets, which the track read refuses — so a lane path
 * must not slip past that check.
 * @param args - The read's params, aimed at one target
 * @returns The lane it names, or undefined when it names something else
 */
export function takeLaneRead(args: ReadTrackArgs): TakeLaneTarget | undefined {
  if (args.path == null) {
    return laneById(args);
  }

  if (args.id != null || args.trackId != null || args.trackIndex != null) {
    return undefined;
  }

  const path = takeLanePathEntry(args.path);

  return path == null ? undefined : { from: "path", path, entry: args.path };
}

/**
 * Read one take lane: what it is, and its clips when the read asked for
 * arrangement clips.
 * @param target - The lane the read named
 * @param include - Include array as read-track received it
 * @param notation - Active notation for nested clip note formatting
 * @returns The lane's id, path, name, and clips when included
 * @throws Error when a path names no existing lane
 */
export function readOneTakeLane(
  target: TakeLaneTarget,
  include: string[] | undefined,
  notation: Notation | undefined,
): Record<string, unknown> {
  const located = locateLane(target);
  const { includeArrangementClips } = parseIncludeArray(
    include,
    READ_TRACK_DEFAULTS,
  );

  return {
    id: located.lane.id,
    ...pathField(located.lane),
    name: located.lane.getName(),
    ...(includeArrangementClips
      ? { clips: laneClips(located, include, notation) }
      : {}),
  };
}

// --- Helpers below main exports ---

/**
 * The lane an id named, by either spelling. Silent about a value that names
 * nothing: the track read reports on those.
 * @param args - The read's params, aimed at one target
 * @returns The lane, or undefined when no id names one
 */
function laneById(args: ReadTrackArgs): TakeLaneTarget | undefined {
  const id = [args.id, args.trackId].find((value) =>
    paramNamesSomething(value),
  );

  if (id == null) {
    return undefined;
  }

  const lane = takeLaneById(id.trim());

  return lane == null ? undefined : { from: "id", lane };
}

/**
 * The lane object a target names. An id already found it; a path has to check
 * the track on the way, so the track comes back with it.
 * @param target - The lane the read named
 * @returns The lane, and the track when the path resolved one
 * @throws Error when a path names no existing lane
 */
function locateLane(target: TakeLaneTarget): LocatedLane {
  if (target.from === "id") {
    return { lane: target.lane, track: null };
  }

  const { path, entry } = target;

  if (path.kind === "new-take-lane") {
    throw pathError(
      "path",
      entry,
      `${NEW_TAKE_LANE_ADVICE}; read an existing lane as "t<track>/l<lane>"`,
    );
  }

  const track = LiveAPI.from(livePath.track(path.trackIndex));

  if (!track.exists()) {
    throw new Error(`nothing at path "${entry}"`);
  }

  assertTrackTakesLanes(track, path.trackIndex);

  const lane = track.child("take_lanes", String(path.laneIndex));

  if (!lane.exists()) {
    throw new Error(`nothing at path "${entry}"`);
  }

  return { lane, track };
}

/**
 * The clips on a lane, read the way a track read's `takeLanes` reads them.
 * @param located - The lane, and its track when the read already resolved one
 * @param include - Include array as read-track received it
 * @param notation - Active notation for nested clip note formatting
 * @returns The lane's clips
 */
function laneClips(
  located: LocatedLane,
  include: string[] | undefined,
  notation: Notation | undefined,
): unknown[] {
  const expanded = expandWildcardIncludes(include, READ_TRACK_DEFAULTS);
  // Drum mode is the track's, so an id target has to go find it.
  const track =
    located.track ??
    LiveAPI.from(livePath.track(located.lane.trackIndex as number));

  return readTakeLaneClips(
    located.lane,
    drumModeForTrack(track, expanded)(),
    expanded,
    notation,
  );
}
