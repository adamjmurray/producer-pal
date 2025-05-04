// device/list-tracks.js
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

    // Get clip information for each clip slot
    const clipSlotIds = parseIds(track.get("clip_slots"));

    clipSlotIds.forEach((clipSlotId, clipSlotIndex) => {
      const clipSlot = new LiveAPI(clipSlotId);

      if (clipSlot.get("has_clip") > 0) {
        const clipId = parseId(clipSlot.get("clip"));
        const clip = new LiveAPI(clipId);

        const clipInfo = {
          id: clip.id,
          slotIndex: clipSlotIndex,
          name: clip.get("name")?.[0],
          color: liveColorToCss(clip.get("color")),
          type: clip.get("is_midi_clip") > 0 ? "midi" : "audio",
          location: clip.get("is_arrangement_clip") > 0 ? "arrangement" : "session",
          // ignore real-time state for now:
          // isPlaying: clip.get("is_playing") > 0,
          // isRecording: clip.get("is_recording") > 0,
          // isOverdubbing: clip.get("is_overdubbing") > 0,
          length: clip.get("length")?.[0],
          startTime: clip.get("start_time")?.[0],
          endTime: clip.get("end_time")?.[0],
          startMarker: clip.get("start_marker")?.[0],
          endMarker: clip.get("end_marker")?.[0],
          isLooping: clip.get("looping") > 0,
          loopStart: clip.get("loop_start")?.[0],
          loopEnd: clip.get("loop_end")?.[0],
        };

        trackInfo.clips.push(clipInfo);
      }
    });

    tracks.push(trackInfo);
  });

  return tracks;
}

module.exports = { listTracks };
