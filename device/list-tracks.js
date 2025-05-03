// device/list-tracks.js
// CJS (require()'d by v8)

const toString = (any) => {
  const s = String(any);
  return s.includes("[object Object]") ? JSON.stringify(any) : s;
};
const log = (...any) => post(...any.map(toString), "\n");
const error = (...any) => globalThis.error(...any.map(toString), "\n");
log("----------------- v8.js reloaded ---------------------,\n", new Date());

function parseIds(idArray) {
  var result = [];
  for (var i = 0; i < idArray.length; i += 2) {
    result.push(idArray[i] + " " + idArray[i + 1]); // e.g., "id 30"
  }
  return result;
}

function parseId(idArray) {
  return `${idArray[0]} ${idArray[1]}`;
}

function liveColorToCss(colorValue) {
  var r = (colorValue >> 16) & 0xff;
  var g = (colorValue >> 8) & 0xff;
  var b = colorValue & 0xff;

  // Convert each to 2-digit hex and concatenate
  return (
    "#" +
    r.toString(16).padStart(2, "0").toUpperCase() +
    g.toString(16).padStart(2, "0").toUpperCase() +
    b.toString(16).padStart(2, "0").toUpperCase()
  );
}

function listTracks() {
  try {
    const song = new LiveAPI("live_set");
    const trackIds = parseIds(song.get("tracks"));
    log(`Found ${trackIds.length} tracks`);

    const tracks = [];

    trackIds.forEach((trackId, trackIndex) => {
      const track = new LiveAPI(trackId);

      // Get track properties
      const trackInfo = {
        index: trackIndex,
        id: track.id,
        name: track.get("name"),
        color: liveColorToCss(track.get("color")),
        isGroup: track.get("is_foldable") > 0,
        hasAudioInput: track.get("has_audio_input") > 0,
        hasMidiInput: track.get("has_midi_input") > 0,
        isMuted: track.get("mute") > 0,
        isSoloed: track.get("solo") > 0,
        isArmed: track.get("arm") > 0,
        clips: [],
      };

      // Get clip information for each clip slot
      const clipSlotIds = parseIds(track.get("clip_slots"));
      log(`Found ${clipSlotIds.length} clip slots in track ${trackIndex}`);

      clipSlotIds.forEach((clipSlotId, clipSlotIndex) => {
        const clipSlot = new LiveAPI(clipSlotId);

        if (clipSlot.get("has_clip") > 0) {
          const clipId = parseId(clipSlot.get("clip"));
          const clip = new LiveAPI(clipId);

          const clipInfo = {
            slotIndex: clipSlotIndex,
            id: clip.id,
            name: clip.get("name"),
            isAudioClip: clip.get("is_audio_clip") > 0,
            isMidiClip: clip.get("is_midi_clip") > 0,
            isPlaying: clip.get("is_playing") > 0,
            isRecording: clip.get("is_recording") > 0,
            color: liveColorToCss(clip.get("color")),
            startTime: clip.get("start_time"),
            length: clip.get("length"),
          };

          trackInfo.clips.push(clipInfo);
        }
      });

      tracks.push(trackInfo);
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(tracks, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error listing tracks: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

module.exports = { listTracks };
