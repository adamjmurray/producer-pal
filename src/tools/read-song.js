// src/tools/read-song.js
import { fromLiveApiView } from "../utils.js";
import { readScene } from "./read-scene";
import { readTrack } from "./read-track";

export function readSong() {
  const liveSet = new LiveAPI("live_set");
  const liveApp = new LiveAPI("live_app");
  const appView = new LiveAPI("live_app view");
  const trackIds = liveSet.getChildIds("tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  return {
    id: liveSet.id,
    abletonLiveVersion: liveApp.call("get_version_string"),
    name: liveSet.getProperty("name"),
    isPlaying: liveSet.getProperty("is_playing") > 0,
    followsArrangement: liveSet.getProperty("back_to_arranger") === 0,
    tempo: liveSet.getProperty("tempo"),
    timeSignature: `${liveSet.getProperty("signature_numerator")}/${liveSet.getProperty("signature_denominator")}`,
    scaleMode: liveSet.getProperty("scale_mode") > 0,
    scaleName: liveSet.getProperty("scale_name"),
    scaleRootNote: liveSet.getProperty("root_note"),
    scaleIntervals: liveSet.getProperty("scale_intervals"),
    view: fromLiveApiView(appView.getProperty("focused_document_view")),
    tracks: trackIds.map((_trackId, trackIndex) => readTrack({ trackIndex })),
    scenes: sceneIds.map((_sceneId, sceneIndex) => readScene({ sceneIndex })),
  };
}
