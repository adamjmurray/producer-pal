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
 * @param context - Internal context object (supplies the active notation)
 * @returns Live Set information including tracks, scenes, tempo, time signature, and scale
 */
export function readLiveSet(
  args: ReadLiveSetArgs = {},
  context: Partial<ToolContext> = {},
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

  // One pass over the session grid, shared by the scenes and the tracks below.
  // Each counts the same slots — scenes by column, tracks by row — so counting
  // in both places built every clip in the Set twice.
  const clipCounts =
    includeFlags.includeScenes || includeFlags.includeTracks
      ? sessionClipCounts(trackIds.length, sceneIds.length)
      : null;

  const liveSetName = liveSet.getProperty("name");
  const result: Record<string, unknown> = {
    ...(liveSetName ? { name: liveSetName } : {}),
    tempo: liveSet.getProperty("tempo"),
    timeSignature: liveSet.timeSignature,
  };

  // Include full scene details or just the count
  if (includeFlags.includeScenes) {
    result.scenes = sceneIds.map((_sceneId, sceneIndex) =>
      readScene(
        {
          sceneIndex,
          include: trackInclude,
          clipCount: clipCounts?.perScene[sceneIndex],
        },
        context,
      ),
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
      readTrack(
        {
          trackIndex,
          include: trackInclude,
          returnTrackNames,
          sessionClipCount: clipCounts?.perTrack[trackIndex],
        },
        context,
      ),
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
          notation: context.notation,
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
      notation: context.notation,
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

interface SessionClipCounts {
  /** Clips on each track, indexed by track */
  perTrack: number[];
  /** Clips in each scene, indexed by scene */
  perScene: number[];
}

/**
 * Count the session clips once, by track and by scene.
 *
 * Testing a slot means building an object for it, so the grid costs one build
 * per slot however it is counted — the saving is in counting it once. A Live
 * Set read never asks tracks or scenes for full clips, so both only ever want
 * these totals.
 * @param trackCount - Number of regular tracks
 * @param sceneCount - Number of scenes, which is every track's slot count
 * @returns Clip counts per track and per scene
 */
function sessionClipCounts(
  trackCount: number,
  sceneCount: number,
): SessionClipCounts {
  const grid = Array.from({ length: trackCount }, (_, trackIndex) =>
    Array.from({ length: sceneCount }, (__, sceneIndex) =>
      LiveAPI.from(
        livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
      ).exists(),
    ),
  );

  return {
    perTrack: grid.map((row) => row.filter(Boolean).length),
    perScene: Array.from(
      { length: sceneCount },
      (_, sceneIndex) => grid.filter((row) => row[sceneIndex]).length,
    ),
  };
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
