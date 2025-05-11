// device/tool-read-live-set.js
const { readTrack } = require("./tool-read-track");

function readLiveSet() {
  const liveSet = new LiveAPI("live_set");
  const trackIds = liveSet.getChildIds("tracks");

  return {
    id: liveSet.id,
    name: liveSet.getProperty("name"),
    isPlaying: liveSet.getProperty("is_playing") > 0,
    tempo: liveSet.getProperty("tempo"),
    timeSignature: `${liveSet.getProperty("signature_numerator")}/${liveSet.getProperty("signature_denominator")}`,
    isScaleModeEnabled: liveSet.getProperty("scale_mode") > 0,
    scaleName: liveSet.getProperty("scale_name"),
    scaleRootNote: liveSet.getProperty("root_note"),
    scaleIntervals: liveSet.getProperty("scale_intervals"),
    trackCount: trackIds.length,
    tracks: trackIds.map((_trackId, trackIndex) => readTrack({ trackIndex })),
  };
}

module.exports = { readLiveSet };
