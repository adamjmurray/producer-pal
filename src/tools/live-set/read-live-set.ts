// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
} from "#src/shared/pitch.ts";
import { readScene } from "#src/tools/scene/read-scene.ts";
import { readLocators } from "#src/tools/shared/locator/locator-helpers.ts";
import {
  type IncludeFlags,
  parseIncludeArray,
  READ_SONG_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import {
  readTrack,
  readTrackGeneric,
} from "#src/tools/track/read/read-track.ts";

interface ReadLiveSetArgs {
  include?: string[];
}

/**
 * Read comprehensive information about the Live Set
 * @param args - The parameters
 * @param _context - Internal context object (unused)
 * @returns Live Set information including tracks, scenes, tempo, time signature, and scale
 */
export function readLiveSet(
  args: ReadLiveSetArgs = {},
  _context: Partial<ToolContext> = {},
): Record<string, unknown> {
  const includeFlags = parseIncludeArray(args.include, READ_SONG_DEFAULTS);
  const liveSet = LiveAPI.from(livePath.liveSet);
  const trackIds = liveSet.getChildIds("tracks");
  const returnTrackIds = liveSet.getChildIds("return_tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  // Build include array to propagate to track/scene readers
  const trackInclude = buildTrackInclude(includeFlags);

  // Compute return track names once for efficiency (used for sends in mixer data)
  const returnTrackNames: string[] = returnTrackIds.map((_, idx) => {
    const rt = LiveAPI.from(livePath.returnTrack(idx));

    return rt.getProperty("name") as string;
  });

  const liveSetName = liveSet.getProperty("name");
  const result: Record<string, unknown> = {
    ...(liveSetName ? { name: liveSetName } : {}),
    tempo: liveSet.getProperty("tempo"),
    timeSignature: liveSet.timeSignature,
  };

  // Include full scene details or just the count
  if (includeFlags.includeScenes) {
    result.scenes = sceneIds.map((_sceneId, sceneIndex) =>
      readScene({ sceneIndex, include: trackInclude }),
    );
  } else {
    result.sceneCount = sceneIds.length;
  }

  // Only include isPlaying when true
  const isPlaying = (liveSet.getProperty("is_playing") as number) > 0;

  if (isPlaying) {
    result.isPlaying = isPlaying;
  }

  // Tracks: full details or counts
  if (includeFlags.includeTracks) {
    result.tracks = trackIds.map((_trackId, trackIndex) =>
      readTrack({
        trackIndex,
        include: trackInclude,
        returnTrackNames,
      }),
    );
    result.returnTracks = returnTrackIds.map(
      (_returnTrackId, returnTrackIndex) => {
        const returnTrack = LiveAPI.from(
          livePath.returnTrack(returnTrackIndex),
        );

        return readTrackGeneric({
          track: returnTrack,
          trackIndex: returnTrackIndex,
          category: "return",
          include: trackInclude,
          returnTrackNames,
        });
      },
    );
    const masterTrack = LiveAPI.from(livePath.masterTrack());

    result.masterTrack = readTrackGeneric({
      track: masterTrack,
      trackIndex: null,
      category: "master",
      include: trackInclude,
      returnTrackNames,
    });
  } else {
    result.regularTrackCount = trackIds.length;
    result.returnTrackCount = returnTrackIds.length;
  }

  // Only include scale properties when scale is enabled
  const scaleEnabled = (liveSet.getProperty("scale_mode") as number) > 0;

  if (scaleEnabled) {
    const scaleName = liveSet.getProperty("scale_name");
    const rootNote = liveSet.getProperty("root_note") as number;
    const scaleRoot = PITCH_CLASS_NAMES[rootNote];

    result.scale = `${scaleRoot} ${String(scaleName)}`;
    const scaleIntervals = liveSet.getProperty("scale_intervals") as number[];

    result.scalePitches = intervalsToPitchClasses(
      scaleIntervals,
      rootNote,
    ).join(",");
  }

  // Include locators when requested
  if (includeFlags.includeLocators) {
    const timeSigNumerator = liveSet.getProperty(
      "signature_numerator",
    ) as number;
    const timeSigDenominator = liveSet.getProperty(
      "signature_denominator",
    ) as number;

    result.locators = readLocators(
      liveSet,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  return result;
}

/**
 * Build include array to propagate to track/scene readers
 * @param flags - Parsed include flags
 * @returns Array of include options recognized by readTrack/readScene
 */
function buildTrackInclude(flags: IncludeFlags): string[] {
  const include: string[] = [];

  if (flags.includeRoutings) include.push("routings");
  if (flags.includeMixer) include.push("mixer");
  if (flags.includeColor) include.push("color");

  return include;
}
