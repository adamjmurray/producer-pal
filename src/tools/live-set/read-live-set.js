import {
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
} from "#src/shared/pitch.js";
import { readScene } from "#src/tools/scene/read-scene.js";
import { readLocators } from "#src/tools/shared/locator/locator-helpers.js";
import {
  includeArrayFromFlags,
  parseIncludeArray,
  READ_SONG_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.js";
import { readTrackMinimal } from "#src/tools/track/read/helpers/read-track-helpers.js";
import {
  readTrack,
  readTrackGeneric,
} from "#src/tools/track/read/read-track.js";

/**
 * Read comprehensive information about the Live Set
 * @param {{ include?: string[] }} [args] - The parameters
 * @param {Partial<ToolContext>} [_context] - Internal context object (unused)
 * @returns {Record<string, unknown>} Live Set information including tracks, scenes, tempo, time signature, and scale
 */
export function readLiveSet(args = {}, _context = {}) {
  const includeFlags = parseIncludeArray(args.include, READ_SONG_DEFAULTS);
  const includeArray = includeArrayFromFlags(includeFlags);
  const liveSet = LiveAPI.from("live_set");
  const trackIds = liveSet.getChildIds("tracks");
  const returnTrackIds = liveSet.getChildIds("return_tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  // Compute return track names once for efficiency (used for sends in mixer data)
  /** @type {string[]} */
  const returnTrackNames = returnTrackIds.map((_, idx) => {
    const rt = LiveAPI.from(`live_set return_tracks ${idx}`);

    return /** @type {string} */ (rt.getProperty("name"));
  });

  const liveSetName = liveSet.getProperty("name");
  /** @type {Record<string, unknown>} */
  const result = {
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
  const isPlaying =
    /** @type {number} */ (liveSet.getProperty("is_playing")) > 0;

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
    includeFlags.includeArrangementClips ||
    includeFlags.includeAllClips
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
  const scaleEnabled =
    /** @type {number} */ (liveSet.getProperty("scale_mode")) > 0;

  if (scaleEnabled) {
    const scaleName = liveSet.getProperty("scale_name");
    const rootNote = /** @type {number} */ (liveSet.getProperty("root_note"));
    const scaleRoot = PITCH_CLASS_NAMES[rootNote];

    result.scale = `${scaleRoot} ${scaleName}`;
    const scaleIntervals = /** @type {number[]} */ (
      liveSet.getProperty("scale_intervals")
    );

    result.scalePitches = intervalsToPitchClasses(
      scaleIntervals,
      rootNote,
    ).join(",");
  }

  // Include locators when requested
  if (includeFlags.includeLocators) {
    const timeSigNumerator = /** @type {number} */ (
      liveSet.getProperty("signature_numerator")
    );
    const timeSigDenominator = /** @type {number} */ (
      liveSet.getProperty("signature_denominator")
    );

    result.locators = readLocators(
      liveSet,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  return result;
}
