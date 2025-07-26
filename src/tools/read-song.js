// src/tools/read-song.js
import {
  PITCH_CLASS_NAMES,
  intervalsToPitchClasses,
} from "../notation/midi-pitch-to-name.js";
import { readScene } from "./read-scene.js";
import { readTrack } from "./read-track.js";

export function readSong({
  includeDrumChains = false,
  includeNotes = false,
  includeRackChains = true,
  includeEmptyScenes = false,
  includeMidiEffects = false,
  includeInstrument = true,
  includeAudioEffects = false,
  includeRoutings = false,
  includeSessionClips = false,
  includeArrangementClips = false,
} = {}) {
  const liveSet = new LiveAPI("live_set");
  const liveApp = new LiveAPI("live_app");
  const trackIds = liveSet.getChildIds("tracks");
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
    tracks: trackIds.map((_trackId, trackIndex) =>
      readTrack({
        trackIndex,
        includeDrumChains,
        includeNotes,
        includeRackChains,
        includeMidiEffects,
        includeInstrument,
        includeAudioEffects,
        includeRoutings,
        includeSessionClips,
        includeArrangementClips,
      }),
    ),
    scenes: sceneIds
      .map((_sceneId, sceneIndex) => readScene({ sceneIndex, includeNotes }))
      .filter((scene) => includeEmptyScenes || !scene.isEmpty),
  };

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
