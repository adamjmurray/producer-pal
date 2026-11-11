// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { VERSION } from "#src/shared/config.ts";
import {
  livePath,
  type TrackPath,
} from "#src/shared/live-api-path-builders.ts";
import {
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
} from "#src/shared/pitch.ts";
import {
  formatObjectPath,
  type TrackSegment,
} from "#src/tools/shared/validation/object-path.ts";

/** A track list longer than this is replaced by `TOO_MANY_TO_LIST`. */
const MAX_LISTED_TRACKS = 256;

/** Stands in for a list over the cap, so its absence isn't read as "none". */
const TOO_MANY_TO_LIST = "Too many to list here: use ppal-read-live-set";

interface LiveSetInfo {
  name?: unknown;
  tempo: unknown;
  timeSignature: string | null;
  sceneCount: number;
  regularTrackCount: number;
  returnTrackCount: number;
  tracks?: ListedTrack[] | string;
  returnTracks?: ListedTrack[] | string;
  isPlaying?: boolean;
  scale?: string;
  scalePitches?: string;
}

/** A track in the overview: the path and name read-live-set gives it. */
interface ListedTrack {
  path: string;
  name: string;
}

interface VersionCheckResult {
  connected: boolean;
  producerPalVersion: string;
  abletonLiveVersion: string;
}

interface ConnectResult extends VersionCheckResult {
  liveSet: LiveSetInfo;
}

/**
 * Initialize connection to Ableton Live with a small Live Set overview. The
 * project context, global context, memory and next step are added Node-side
 * (V8 has no filesystem).
 * @param _params - No parameters used
 * @returns Connection status and basic Live Set info
 */
export function connect(_params: object = {}): ConnectResult {
  const versions = connectVersions();
  const liveSet = LiveAPI.from("live_set");

  const trackIds = liveSet.getChildIds("tracks");
  const returnTrackIds = liveSet.getChildIds("return_tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  // Build liveSet overview matching readLiveSet default response
  const liveSetName = liveSet.getName();

  const liveSetInfo: LiveSetInfo = {
    ...(liveSetName ? { name: liveSetName } : {}),
    tempo: liveSet.getProperty("tempo"),
    timeSignature: liveSet.timeSignature,
    sceneCount: sceneIds.length,
    regularTrackCount: trackIds.length,
    returnTrackCount: returnTrackIds.length,
    ...trackLists(trackIds.length, returnTrackIds.length),
  };

  const isPlaying = (liveSet.getProperty("is_playing") as number) > 0;

  if (isPlaying) {
    liveSetInfo.isPlaying = true;
  }

  const scaleMode = liveSet.getProperty("scale_mode") as number;
  const scaleEnabled = scaleMode > 0;

  if (scaleEnabled) {
    const scaleName = liveSet.getProperty("scale_name") as string;
    const rootNote = liveSet.getProperty("root_note") as number;
    const scaleRoot = PITCH_CLASS_NAMES[rootNote];

    liveSetInfo.scale = `${scaleRoot} ${scaleName}`;

    const scaleIntervals = liveSet.getProperty("scale_intervals") as number[];

    liveSetInfo.scalePitches = intervalsToPitchClasses(
      scaleIntervals,
      rootNote,
    ).join(",");
  }

  return { ...versions, liveSet: liveSetInfo };
}

/**
 * Lists regular and return tracks as `{ path, name }`. An empty list is left
 * out, and one longer than the cap is replaced by a note.
 * @param trackCount - Number of regular tracks
 * @param returnTrackCount - Number of return tracks
 * @returns The `tracks` and `returnTracks` fields that apply
 */
function trackLists(
  trackCount: number,
  returnTrackCount: number,
): Pick<LiveSetInfo, "tracks" | "returnTracks"> {
  const lists: Pick<LiveSetInfo, "tracks" | "returnTracks"> = {};

  if (trackCount > 0) {
    lists.tracks = listTracks(trackCount, false);
  }

  if (returnTrackCount > 0) {
    lists.returnTracks = listTracks(returnTrackCount, true);
  }

  return lists;
}

function listTracks(count: number, isReturn: boolean): ListedTrack[] | string {
  if (count > MAX_LISTED_TRACKS) {
    return TOO_MANY_TO_LIST;
  }

  return Array.from({ length: count }, (_, index) => {
    const [segment, path]: [TrackSegment, TrackPath] = isReturn
      ? [
          { kind: "return-track", returnIndex: index },
          livePath.returnTrack(index),
        ]
      : [{ kind: "track", trackIndex: index }, livePath.track(index)];

    return {
      path: formatObjectPath(segment),
      name: LiveAPI.from(path).getName(),
    };
  });
}

/**
 * The `versionCheck: true` answer: the versions only, so the Live Set is never
 * read.
 * @returns Connection status and both versions
 */
export function connectVersions(): VersionCheckResult {
  // Live 12.4 returns "12.4" which Max V8 coerces to a number; force string.
  const abletonLiveVersion = String(
    LiveAPI.from("live_app").call("get_version_string"),
  );

  return { connected: true, producerPalVersion: VERSION, abletonLiveVersion };
}
