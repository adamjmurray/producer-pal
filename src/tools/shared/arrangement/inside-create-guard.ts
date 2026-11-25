// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live 12.3 crashes (SIGABRT) when create_midi_clip or create_audio_clip puts
// an arrangement clip with both edges strictly inside one existing clip. 12.4
// doesn't. A new clip that starts at a clip's edge can't be inside it, so one
// cut at the new start is enough.

import { errorMessage } from "#src/shared/error-message.ts";
import {
  liveVersionAtLeast,
  liveVersionString,
} from "#src/tools/shared/helpers/live-api-values.ts";
import { arrangementPositionPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { markSetChanged } from "#src/tools/shared/write-pipeline/set-changed.ts";
import { cutArrangementClipAt } from "./arrangement-duplicate-workaround.ts";
import { type LaneView, laneViewOf } from "./helpers/arrangement-lane-view.ts";
import { type ClipSpan } from "./helpers/arrangement-write-effects.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

/** The first Live that creates a clip inside another without crashing. */
const FIXED_IN = "12.4";

/** What the guard needs from the call. */
export interface InsideCreateContext {
  silenceWavPath?: string;
  lanes?: LaneView;
}

/** One create the guard checks. */
export interface InsideCreate {
  /** The Track, or the TakeLane, the clip is created on. */
  laneApi: LiveAPI;
  /** The lane, when the caller knows it; else read from `laneApi`. */
  lane?: ArrangementLane;
  start: number;
  /** Where it ends; null for an audio clip, whose sample sets its length. */
  end: number | null;
  isMidi: boolean;
  context: InsideCreateContext;
  /** Told the moment the cut lands, with the cut clip's path. */
  onCut?: (path: string) => void;
}

/**
 * Make a create safe on Live before 12.4: when it would land inside a clip,
 * cut that clip at the new start (main lane) or refuse (take lane, where Live
 * deletes no temp clip, so a cut is impossible). Does nothing on Live 12.4 or
 * later.
 * @param create - The create about to run
 * @throws Error worded for the target's skip, on a take lane or a failed cut
 */
export function guardInsideCreate(create: InsideCreate): void {
  // First, before any other read: on fixed Live this must do nothing at all.
  // A version that doesn't read as a number counts as fixed too.
  if (liveVersionAtLeast(FIXED_IN) || !/^\d+\.\d+/.test(liveVersionString())) {
    return;
  }

  const { laneApi, start, end, isMidi, context, onCut } = create;
  const lane = create.lane ?? laneOfInsideCreate(laneApi);
  const host = clipAround(laneViewOf(context), lane, start, laneApi);

  // A clip that reaches the host's end only trims it, which doesn't crash.
  if (host == null || (end != null && end >= host.end - SAME_TIME_EPSILON)) {
    return;
  }

  const path = arrangementPositionPath(lane, host.start);

  if (lane.kind === "take-lane") {
    throw new Error(
      `Live 12.3 crashes placing a clip inside another on a take lane ` +
        `(${path}); start it at or outside that clip's edges, or use Live 12.4`,
    );
  }

  cutHost(laneApi, host, start, isMidi, context, path);
  onCut?.(path);

  // Creating with the start still inside a clip would crash Live.
  if (clipAround(laneViewOf(context), lane, start, laneApi) != null) {
    throw new Error(
      `couldn't cut the clip at ${path} first, and Live 12.3 crashes ` +
        `placing a clip inside another`,
    );
  }
}

// --- Helpers below main exports ---

/**
 * The lane a Track or TakeLane holds.
 * @param laneApi - The Track, or a TakeLane
 * @returns Its lane
 */
function laneOfInsideCreate(laneApi: LiveAPI): ArrangementLane {
  const trackIndex = laneApi.trackIndex ?? -1;

  // By type, not path: a lane built from an id has no indices in its path.
  return laneApi.type === "TakeLane"
    ? { kind: "take-lane", trackIndex, laneIndex: laneApi.takeLaneIndex ?? -1 }
    : { kind: "track", trackIndex };
}

/**
 * The clip a position falls strictly inside.
 * @param lanes - The call's lanes
 * @param lane - The lane
 * @param beats - The position
 * @param laneApi - The lane object
 * @returns The clip, or undefined when the position is in none, or on an edge
 */
function clipAround(
  lanes: LaneView,
  lane: ArrangementLane,
  beats: number,
  laneApi: LiveAPI,
): ClipSpan | undefined {
  const clip = lanes.covering(lane, beats, laneApi);

  // Rounding at either edge counts as on the edge, which is safe.
  return clip != null &&
    beats > clip.start + SAME_TIME_EPSILON &&
    beats < clip.end - SAME_TIME_EPSILON
    ? clip
    : undefined;
}

/**
 * Cut the clip in the way, reporting a cut that failed partway.
 * @param track - The track
 * @param host - The clip to cut
 * @param start - Where to cut
 * @param isMidi - Whether the track is MIDI
 * @param context - The call's silence file and lanes
 * @param path - The clip's path, for the error
 */
function cutHost(
  track: LiveAPI,
  host: ClipSpan,
  start: number,
  isMidi: boolean,
  context: InsideCreateContext,
  path: string,
): void {
  try {
    cutArrangementClipAt(track, host, start, isMidi, {
      ...context,
      silenceWavPath: context.silenceWavPath as string,
    });
  } catch (error) {
    throw new Error(
      `couldn't cut the clip at ${path} first (${errorMessage(error)}); it ` +
        `may be left partly cut, with a copy past the end of the arrangement`,
      { cause: error },
    );
  } finally {
    // Even a failed cut may leave a copy in the holding area.
    markSetChanged();
  }
}
