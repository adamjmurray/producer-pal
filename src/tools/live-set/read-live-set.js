import {
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
} from "../../notation/midi-pitch-to-name.js";
import { readScene } from "../scene/read-scene.js";
import { readCuePoints } from "../shared/cue/cue-helpers.js";
import {
  includeArrayFromFlags,
  parseIncludeArray,
  READ_SONG_DEFAULTS,
} from "../shared/tool-framework/include-params.js";
import { readTrackMinimal } from "../track/read/helpers/read-track-helpers.js";
import { readTrack, readTrackGeneric } from "../track/read/read-track.js";

/**
 * Read comprehensive information about the Live Set
 * @param {object} args - The parameters
 * @param {Array<string>} [args.include] - Array of data to include in the response
 * @param {object} _context - Internal context object (unused)
 * @returns {object} Live Set information including tracks, scenes, tempo, time signature, and scale
 */
export function readLiveSet(args = {}, _context = {}) {
  const includeFlags = parseIncludeArray(args.include, READ_SONG_DEFAULTS);
  const includeArray = includeArrayFromFlags(includeFlags);
  const liveSet = new LiveAPI("live_set");
  const trackIds = liveSet.getChildIds("tracks");
  const returnTrackIds = liveSet.getChildIds("return_tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  // Compute return track names once for efficiency (used for sends in mixer data)
  const returnTrackNames = returnTrackIds.map((_, idx) => {
    const rt = new LiveAPI(`live_set return_tracks ${idx}`);

    return rt.getProperty("name");
  });

  const liveSetName = liveSet.getProperty("name");
  const result = {
    id: liveSet.id,
    ...(liveSetName && { name: liveSetName }),
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
  const isPlaying = liveSet.getProperty("is_playing") > 0;

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
        const returnTrack = new LiveAPI(
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
    const masterTrack = new LiveAPI("live_set master_track");

    result.masterTrack = readTrackGeneric({
      track: masterTrack,
      trackIndex: null,
      category: "master",
      include: includeArray,
      returnTrackNames,
    });
  }

  // Only include scale properties when scale is enabled
  const scaleEnabled = liveSet.getProperty("scale_mode") > 0;

  if (scaleEnabled) {
    const scaleName = liveSet.getProperty("scale_name");
    const rootNote = liveSet.getProperty("root_note");
    const scaleRoot = PITCH_CLASS_NAMES[rootNote];

    result.scale = `${scaleRoot} ${scaleName}`;
    const scaleIntervals = liveSet.getProperty("scale_intervals");

    result.scalePitches = intervalsToPitchClasses(
      scaleIntervals,
      rootNote,
    ).join(",");
  }

  // Include cue points when requested
  if (includeFlags.includeCuePoints) {
    const timeSigNumerator = liveSet.getProperty("signature_numerator");
    const timeSigDenominator = liveSet.getProperty("signature_denominator");

    result.cuePoints = readCuePoints(
      liveSet,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  return result;
}
