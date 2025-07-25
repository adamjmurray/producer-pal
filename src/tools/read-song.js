// src/tools/read-song.js
import {
  PITCH_CLASS_NAMES,
  intervalsToPitchClasses,
} from "../notation/midi-pitch-to-name.js";
import { fromLiveApiView } from "../utils.js";
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
  const appView = new LiveAPI("live_app view");
  const trackIds = liveSet.getChildIds("tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  // Get selection state
  const selectedTrack = new LiveAPI("live_set view selected_track");
  const selectedScene = new LiveAPI("live_set view selected_scene");
  const detailClip = new LiveAPI("live_set view detail_clip");
  const highlightedClipSlotAPI = new LiveAPI(
    "live_set view highlighted_clip_slot",
  );

  // Extract indices from paths
  const selectedTrackIndex = selectedTrack.exists()
    ? selectedTrack.trackIndex
    : null;
  const selectedSceneIndex = selectedScene.exists()
    ? selectedScene.sceneIndex
    : null;
  const selectedClipId = detailClip.exists() ? detailClip.id : null;
  const highlightedSlot = highlightedClipSlotAPI.exists()
    ? {
        trackIndex: highlightedClipSlotAPI.trackIndex,
        sceneIndex: highlightedClipSlotAPI.sceneIndex,
      }
    : null;

  const scaleEnabled = liveSet.getProperty("scale_mode") > 0;

  const result = {
    id: liveSet.id,
    abletonLiveVersion: liveApp.call("get_version_string"),
    name: liveSet.getProperty("name"),
    isPlaying: liveSet.getProperty("is_playing") > 0,
    followsArrangement: liveSet.getProperty("back_to_arranger") === 0,
    tempo: liveSet.getProperty("tempo"),
    timeSignature: `${liveSet.getProperty("signature_numerator")}/${liveSet.getProperty("signature_denominator")}`,
    scaleEnabled,
    view: fromLiveApiView(appView.getProperty("focused_document_view")),
    selectedTrackIndex,
    selectedSceneIndex,
    selectedClipId,
    highlightedClipSlot: highlightedSlot,
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
