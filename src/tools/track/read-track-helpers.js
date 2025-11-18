import { readClip } from "../clip/read-clip.js";

/**
 * Read minimal track information for auto-inclusion when clips are requested.
 * Returns only id, type, trackIndex, and clip arrays/counts based on include flags.
 * @param {Object} args - The parameters
 * @param {number} args.trackIndex - Track index
 * @param {Object} args.includeFlags - Parsed include flags
 * @returns {Object} Minimal track information
 */
export function readTrackMinimal({ trackIndex, includeFlags }) {
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    return {
      id: null,
      type: null,
      trackIndex,
    };
  }

  const isMidiTrack = track.getProperty("has_midi_input") > 0;

  const result = {
    id: track.id,
    type: isMidiTrack ? "midi" : "audio",
    trackIndex,
  };

  // Session clips - only for regular tracks
  if (includeFlags.includeSessionClips) {
    result.sessionClips = track
      .getChildIds("clip_slots")
      .map((_clipSlotId, sceneIndex) =>
        readClip({
          trackIndex,
          sceneIndex,
        }),
      )
      .filter((clip) => clip.id != null);
  } else if (includeFlags.includeAllClips) {
    // When all-clips is requested, we need to check if there are session clips
    result.sessionClips = track
      .getChildIds("clip_slots")
      .map((_clipSlotId, sceneIndex) =>
        readClip({
          trackIndex,
          sceneIndex,
        }),
      )
      .filter((clip) => clip.id != null);
  } else {
    result.sessionClipCount = track
      .getChildIds("clip_slots")
      .map((_clipSlotId, sceneIndex) => {
        const clip = new LiveAPI(
          `live_set tracks ${trackIndex} clip_slots ${sceneIndex} clip`,
        );
        return clip.exists() ? clip : null;
      })
      .filter(Boolean).length;
  }

  // Arrangement clips - exclude group tracks which have no arrangement clips
  const isGroup = track.getProperty("is_foldable") > 0;
  if (isGroup) {
    if (includeFlags.includeArrangementClips || includeFlags.includeAllClips) {
      result.arrangementClips = [];
    } else {
      result.arrangementClipCount = 0;
    }
  } else if (
    includeFlags.includeArrangementClips ||
    includeFlags.includeAllClips
  ) {
    result.arrangementClips = track
      .getChildIds("arrangement_clips")
      .map((clipId) => readClip({ clipId }))
      .filter((clip) => clip.id != null);
  } else {
    const clipIds = track.getChildIds("arrangement_clips");
    result.arrangementClipCount = clipIds.length;
  }

  return result;
}
