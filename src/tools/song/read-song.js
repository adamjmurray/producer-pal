// src/tools/song/read-song.js
import {
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
} from "../../notation/midi-pitch-to-name.js";
import { readScene } from "../scene/read-scene.js";
import {
  includeArrayFromFlags,
  parseIncludeArray,
  READ_SONG_DEFAULTS,
} from "../shared/include-params.js";
import { readTrack, readTrackGeneric } from "../track/read-track.js";

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
    scenes: includeFlags.includeScenes
      ? sceneIds.map((_sceneId, sceneIndex) =>
          readScene({ sceneIndex, include: includeArray }),
        )
      : sceneIds.map((sceneId) => ({ id: sceneId })),
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
