// src/tools/read-song.js
import {
  PITCH_CLASS_NAMES,
  intervalsToPitchClasses,
} from "../notation/midi-pitch-to-name.js";
import { readScene } from "./read-scene.js";
import { readTrack, readTrackGeneric } from "./read-track.js";
import {
  parseIncludeArray,
  includeArrayFromFlags,
  READ_SONG_DEFAULTS,
} from "./include-params.js";

export function readSong(args = {}) {
  const includeFlags = parseIncludeArray(args.include, READ_SONG_DEFAULTS);
  const includeArray = includeArrayFromFlags(includeFlags);
  const liveSet = new LiveAPI("live_set");
  const liveApp = new LiveAPI("live_app");
  const trackIds = liveSet.getChildIds("tracks");
  const returnTrackIds = liveSet.getChildIds("return_tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  const scaleEnabled = liveSet.getProperty("scale_mode") > 0;

  const result = {
    id: liveSet.id,
    abletonLiveVersion: liveApp.call("get_version_string"),
    name: liveSet.getProperty("name"),
    isPlaying: liveSet.getProperty("is_playing") > 0,
    followsArrangement: liveSet.getProperty("back_to_arranger") === 0,
    tempo: liveSet.getProperty("tempo"),
    timeSignature: liveSet.timeSignature,
    scaleEnabled,
    scenes: sceneIds
      .map((_sceneId, sceneIndex) =>
        readScene({ sceneIndex, include: includeArray }),
      )
      .filter((scene) => {
        // New logic: if user explicitly uses 'scenes' option, only include non-empty scenes
        // If user uses 'empty-scenes', only include empty scenes
        // If user uses both (via 'all-scenes'), include all scenes
        // Otherwise, use original logic (includeEmptyScenes || !scene.isEmpty)
        if (includeFlags.includeScenes && includeFlags.includeEmptyScenes) {
          return true; // Include all scenes (both empty and non-empty)
        } else if (
          includeFlags.includeScenes &&
          !includeFlags.includeEmptyScenes
        ) {
          return !scene.isEmpty; // Include only non-empty scenes
        } else {
          // Original logic: always include scenes, filtered by includeEmptyScenes
          return includeFlags.includeEmptyScenes || !scene.isEmpty;
        }
      }),
  };

  // Conditionally include track arrays based on include parameters
  if (includeFlags.includeRegularTracks) {
    result.tracks = trackIds.map((_trackId, trackIndex) =>
      readTrack({
        trackIndex,
        include: includeArray,
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
          trackType: "return",
          include: includeArray,
        });
      },
    );
  }

  if (includeFlags.includeMasterTrack) {
    const masterTrack = new LiveAPI("live_set master_track");
    result.masterTrack = readTrackGeneric({
      track: masterTrack,
      trackIndex: null,
      trackType: "master",
      include: includeArray,
    });
  }

  // Only include scale properties when scale is enabled
  if (scaleEnabled) {
    result.scale = liveSet.getProperty("scale_name");
    const rootNote = liveSet.getProperty("root_note");
    result.scaleRoot = PITCH_CLASS_NAMES[rootNote];
    const scaleIntervals = liveSet.getProperty("scale_intervals");
    result.scalePitches = intervalsToPitchClasses(scaleIntervals, rootNote);
  }

  return result;
}
