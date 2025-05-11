// device/tool-list-tracks.js
const { readClip } = require("./tool-read-clip");

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
      .map((clipSlotId, clipSlotIndex) =>
        new LiveAPI(clipSlotId).getProperty("has_clip") ? readClip({ trackIndex, clipSlotIndex }) : null
      )
      .filter((clip) => clip != null),
  }));
}
module.exports = { listTracks };
