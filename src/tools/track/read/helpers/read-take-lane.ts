// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading one take lane, for a read-track path that names a lane rather than a
// track. The clips come with the same include that lists a track's lanes.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type Notation } from "#src/shared/notation.ts";
import { assertTrackTakesLanes } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
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

/**
 * The take lane a read's path names, if it names one. A path sent beside an id
 * or a track index names two targets, which the track read refuses — so a lane
 * path must not slip past that check.
 * @param args - The read's params, aimed at one target
 * @returns The lane it names, or undefined when it names something else
 */
export function takeLaneRead(args: ReadTrackArgs): TakeLanePath | undefined {
  if (
    args.path == null ||
    args.id != null ||
    args.trackId != null ||
    args.trackIndex != null
  ) {
    return undefined;
  }

  return takeLanePathEntry(args.path) ?? undefined;
}

/**
 * Read one take lane: what it is, and its clips when the read asked for
 * arrangement clips.
 * @param lane - The lane the path named
 * @param entry - The path as the caller wrote it, for messages
 * @param include - Include array as read-track received it
 * @param notation - Active notation for nested clip note formatting
 * @returns The lane's id, path, name, and clips when included
 * @throws Error when the path names no existing lane
 */
export function readOneTakeLane(
  lane: TakeLanePath,
  entry: string,
  include: string[] | undefined,
  notation: Notation | undefined,
): Record<string, unknown> {
  if (lane.kind === "new-take-lane") {
    throw pathError(
      "path",
      entry,
      `${NEW_TAKE_LANE_ADVICE}; read an existing lane as "t<track>/l<lane>"`,
    );
  }

  const track = LiveAPI.from(livePath.track(lane.trackIndex));

  if (!track.exists()) {
    throw new Error(`nothing at path "${entry}"`);
  }

  assertTrackTakesLanes(track, lane.trackIndex);

  const api = track.child("take_lanes", String(lane.laneIndex));

  if (!api.exists()) {
    throw new Error(`nothing at path "${entry}"`);
  }

  const { includeArrangementClips } = parseIncludeArray(
    include,
    READ_TRACK_DEFAULTS,
  );

  return {
    id: api.id,
    ...pathField(api),
    name: api.getName(),
    ...(includeArrangementClips
      ? { clips: laneClips(track, api, include, notation) }
      : {}),
  };
}

// --- Helpers below main exports ---

/**
 * The clips on a lane, read the way a track read's `takeLanes` reads them.
 * @param track - The track the lane sits on, for drum-mode detection
 * @param lane - The lane object
 * @param include - Include array as read-track received it
 * @param notation - Active notation for nested clip note formatting
 * @returns The lane's clips
 */
function laneClips(
  track: LiveAPI,
  lane: LiveAPI,
  include: string[] | undefined,
  notation: Notation | undefined,
): unknown[] {
  const expanded = expandWildcardIncludes(include, READ_TRACK_DEFAULTS);

  return readTakeLaneClips(
    lane,
    drumModeForTrack(track, expanded)(),
    expanded,
    notation,
  );
}
