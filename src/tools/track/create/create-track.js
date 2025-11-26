import * as console from "#src/shared/v8-max-console.js";
import { MAX_AUTO_CREATED_TRACKS } from "../../constants.js";

/**
 * Create a single track via Live API
 * @param {LiveAPI} liveSet - Live set object
 * @param {string} type - Track type (midi, audio, return)
 * @param {number} currentIndex - Current index for midi/audio tracks
 * @returns {string} Track ID
 */
function createSingleTrack(liveSet, type, currentIndex) {
  let result;
  if (type === "return") {
    result = liveSet.call("create_return_track");
  } else if (type === "midi") {
    result = liveSet.call("create_midi_track", currentIndex);
  } else {
    result = liveSet.call("create_audio_track", currentIndex);
  }
  return result[1]; // Live API returns ["id", "123"]
}

/**
 * Build track name with optional numbering
 * @param {string|undefined} baseName - Base name for the track
 * @param {number} count - Total number of tracks being created
 * @param {number} index - Current track index in the batch
 * @returns {string|undefined} Track name
 */
function buildTrackName(baseName, count, index) {
  if (baseName == null) return undefined;
  if (count === 1) return baseName;
  if (index === 0) return baseName;
  return `${baseName} ${index + 1}`;
}

/**
 * Calculate result index based on track type and creation mode
 * @param {string} type - Track type
 * @param {number} effectiveTrackIndex - Effective track index (-1 for append)
 * @param {number} baseTrackCount - Base count before creation
 * @param {number} loopIndex - Current loop index
 * @returns {number} Result index
 */
function calculateResultIndex(
  type,
  effectiveTrackIndex,
  baseTrackCount,
  loopIndex,
) {
  if (type === "return" || effectiveTrackIndex === -1) {
    return baseTrackCount + loopIndex;
  }
  return effectiveTrackIndex + loopIndex;
}

/**
 * Get base track count before creation for result index calculation
 * @param {LiveAPI} liveSet - Live set object
 * @param {string} type - Track type
 * @param {number} effectiveTrackIndex - Effective track index
 * @returns {number} Base track count
 */
function getBaseTrackCount(liveSet, type, effectiveTrackIndex) {
  if (type === "return") {
    return liveSet.getChildIds("return_tracks").length;
  }
  if (effectiveTrackIndex === -1) {
    return liveSet.getChildIds("tracks").length;
  }
  return 0;
}

/**
 * Creates new tracks at the specified index
 * @param {object} args - The track parameters
 * @param {number} [args.trackIndex] - Track index (0-based, -1 or omit to append)
 * @param {number} [args.count=1] - Number of tracks to create
 * @param {string} [args.name] - Base name for the tracks
 * @param {string} [args.color] - Color for the tracks (CSS format: hex)
 * @param {string} [args.type="midi"] - Type of tracks ("midi", "audio", or "return")
 * @param {boolean} [args.mute] - Mute state for the tracks
 * @param {boolean} [args.solo] - Solo state for the tracks
 * @param {boolean} [args.arm] - Arm state for the tracks
 * @param {object} _context - Internal context object (unused)
 * @returns {object | Array<object>} Single track object when count=1, array when count>1
 */
export function createTrack(
  { trackIndex, count = 1, name, color, type = "midi", mute, solo, arm } = {},
  _context = {},
) {
  if (count < 1) {
    throw new Error("createTrack failed: count must be at least 1");
  }

  // For return tracks, warn if trackIndex provided (always appends to end)
  if (type === "return" && trackIndex != null) {
    console.error(
      "createTrack: trackIndex is ignored for return tracks (always added at end)",
    );
  }

  // For midi/audio, default to -1 (append to end) if not provided
  const effectiveTrackIndex = trackIndex ?? -1;

  const liveSet = new LiveAPI("live_set");

  // Only check MAX_AUTO_CREATED_TRACKS for non-return tracks with explicit index
  if (
    type !== "return" &&
    effectiveTrackIndex >= 0 &&
    effectiveTrackIndex + count > MAX_AUTO_CREATED_TRACKS
  ) {
    throw new Error(
      `createTrack failed: creating ${count} tracks at index ${effectiveTrackIndex} would exceed the maximum allowed tracks (${MAX_AUTO_CREATED_TRACKS})`,
    );
  }

  const baseTrackCount = getBaseTrackCount(liveSet, type, effectiveTrackIndex);
  const createdTracks = [];
  let currentIndex = effectiveTrackIndex;

  for (let i = 0; i < count; i++) {
    const trackId = createSingleTrack(liveSet, type, currentIndex);
    const track = new LiveAPI(`id ${trackId}`);

    track.setAll({
      name: buildTrackName(name, count, i),
      color,
      mute,
      solo,
      arm,
    });

    const resultIndex = calculateResultIndex(
      type,
      effectiveTrackIndex,
      baseTrackCount,
      i,
    );

    createdTracks.push(
      type === "return"
        ? { id: trackId, returnTrackIndex: resultIndex }
        : { id: trackId, trackIndex: resultIndex },
    );

    // For subsequent midi/audio tracks with explicit index, increment since tracks shift right
    if (type !== "return" && effectiveTrackIndex !== -1) {
      currentIndex++;
    }
  }

  // Return single object if count=1, array if count>1
  return count === 1 ? createdTracks[0] : createdTracks;
}
