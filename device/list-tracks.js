// device/list-tracks.js
const { readClip } = require("./read-clip");
const { parseIds, parseId, liveColorToCss } = require("./utils");

function listTracks() {
  const song = new LiveAPI("live_set");
  const trackIds = parseIds(song.get("tracks"));

  const tracks = [];

  trackIds.forEach((trackId, trackIndex) => {
    const track = new LiveAPI(trackId);

    // Get track properties
    const trackInfo = {
      id: track.id,
      index: trackIndex,
      name: track.get("name")?.[0],
      color: liveColorToCss(track.get("color")),
      type: track.get("has_midi_input") > 0 ? "midi" : "audio",
      isMuted: track.get("mute") > 0,
      isSoloed: track.get("solo") > 0,
      isArmed: track.get("arm") > 0,
      // isGroup: track.get("is_foldable") > 0, // ignore for now to keep things simple
      clips: [],
    };

    const clipSlotIds = parseIds(track.get("clip_slots"));

    clipSlotIds.forEach((clipSlotId, clipSlotIndex) => {
      const clipSlot = new LiveAPI(clipSlotId);
      if (clipSlot.get("has_clip") > 0) {
        trackInfo.clips.push(readClip({ trackIndex, clipSlotIndex }));
      }
    });

    tracks.push(trackInfo);
  });

  return tracks;
}

module.exports = { listTracks };
