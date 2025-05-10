// device/list-tracks.js
const { readClip } = require("./read-clip");

function listTracks() {
  const liveSet = new LiveAPI("live_set");
  return liveSet.getChildren("tracks").map((track, trackIndex) => ({
    id: track.id,
    index: trackIndex,
    name: track.getProperty("name"),
    color: track.getColor(),
    type: track.getProperty("has_midi_input") ? "midi" : "audio",
    isMuted: track.getProperty("mute") > 0,
    isSoloed: track.getProperty("solo") > 0,
    isArmed: track.getProperty("arm") > 0,
    clips: track
      .getChildIds("clip_slots")
      .filter((clipSlotId) => new LiveAPI(clipSlotId).getProperty("has_clip"))
      .map((_clipSlotId, clipSlotIndex) => readClip({ trackIndex, clipSlotIndex })),
  }));
}
module.exports = { listTracks };
