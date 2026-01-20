import {
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
} from "#src/shared/pitch.ts";
import { readScene } from "#src/tools/scene/read-scene.ts";
import { readLocators } from "#src/tools/shared/locator/locator-helpers.ts";
import {
  includeArrayFromFlags,
  parseIncludeArray,
  READ_SONG_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import { readTrackMinimal } from "#src/tools/track/read/helpers/read-track-helpers.ts";
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
  const includeArray = includeArrayFromFlags(includeFlags);
  const liveSet = LiveAPI.from("live_set");
  const trackIds = liveSet.getChildIds("tracks");
  const returnTrackIds = liveSet.getChildIds("return_tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  // Compute return track names once for efficiency (used for sends in mixer data)
  const returnTrackNames: string[] = returnTrackIds.map((_, idx) => {
    const rt = LiveAPI.from(`live_set return_tracks ${idx}`);

    return rt.getProperty("name") as string;
  });

  const liveSetName = liveSet.getProperty("name");
  const result: Record<string, unknown> = {
    id: liveSet.id,
    ...(liveSetName ? { name: liveSetName } : {}),
    tempo: liveSet.getProperty("tempo"),
    timeSignature: liveSet.timeSignature,
  };

  // Include full scene details or just the count
  if (includeFlags.includeScenes) {
    result.scenes = sceneIds.map((_sceneId, sceneIndex) =>
      readScene({ sceneIndex, include: includeArray }),
    );
  } else {
    result.sceneCount = sceneIds.length;
  }

  // Only include isPlaying when true
  const isPlaying = (liveSet.getProperty("is_playing") as number) > 0;

  if (isPlaying) {
    result.isPlaying = isPlaying;
  }

  // Conditionally include track arrays based on include parameters
  if (includeFlags.includeRegularTracks) {
    result.tracks = trackIds.map((_trackId, trackIndex) =>
      readTrack({
        trackIndex,
        include: includeArray,
        returnTrackNames,
      }),
    );
  } else if (
    includeFlags.includeSessionClips ||
    includeFlags.includeArrangementClips
  ) {
    // Auto-include minimal track info when clips are requested without explicit track inclusion
    result.tracks = trackIds.map((_trackId, trackIndex) =>
      readTrackMinimal({
        trackIndex,
        includeFlags,
      }),
    );
  }

  if (includeFlags.includeReturnTracks) {
    result.returnTracks = returnTrackIds.map(
      (_returnTrackId, returnTrackIndex) => {
        const returnTrack = LiveAPI.from(
          `live_set return_tracks ${returnTrackIndex}`,
        );

        return readTrackGeneric({
          track: returnTrack,
          trackIndex: returnTrackIndex,
          category: "return",
          include: includeArray,
          returnTrackNames,
        });
      },
    );
  }

  if (includeFlags.includeMasterTrack) {
    const masterTrack = LiveAPI.from("live_set master_track");

    result.masterTrack = readTrackGeneric({
      track: masterTrack,
      trackIndex: null,
      category: "master",
      include: includeArray,
      returnTrackNames,
    });
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
