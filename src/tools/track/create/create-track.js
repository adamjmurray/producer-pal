import * as console from "#src/shared/v8-max-console.js";
import { MAX_AUTO_CREATED_TRACKS } from "#src/tools/constants.js";
import { buildIndexedName } from "#src/tools/shared/utils.js";

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

  return /** @type {string[]} */ (result)[1]; // Live API returns ["id", "123"]
}

/**
 * Build track name with optional numbering
 * @param {string|undefined} baseName - Base name for the track
 * @param {number} count - Total number of tracks being created
 * @param {number} index - Current track index in the batch
 * @param {string[]|null} parsedNames - Comma-separated names (when count > 1)
 * @returns {string|undefined} Track name
 */
function buildTrackName(baseName, count, index, parsedNames = null) {
  if (baseName == null) return;

  // If we have parsed names from comma-separated input
  if (parsedNames != null) {
    if (index < parsedNames.length) {
      return parsedNames[index];
    }

    // Fall back to numbering from the last name (starting from 2)
    const lastName = parsedNames.at(-1);
    const fallbackIndex = index - parsedNames.length + 2;

    return `${lastName} ${fallbackIndex}`;
  }

  return buildIndexedName(baseName, count, index);
}

/**
 * Get color for a specific track index, cycling through parsed colors
 * @param {string|undefined} color - Original color string
 * @param {number} index - Current track index
 * @param {string[]|null} parsedColors - Comma-separated colors (when count > 1)
 * @returns {string|undefined} Color for this track
 */
function getColorForIndex(color, index, parsedColors) {
  if (color == null) return;
  if (parsedColors == null) return color;

  return parsedColors[index % parsedColors.length];
}

/**
 * Parse comma-separated string when count > 1
 * @param {string|undefined} value - Input string that may contain commas
 * @param {number} count - Number of tracks being created
 * @returns {string[]|null} Array of trimmed values, or null if not applicable
 */
function parseCommaSeparated(value, count) {
  if (count <= 1 || value == null || !value.includes(",")) {
    return null;
  }

  return value.split(",").map((v) => v.trim());
}

/**
 * Validate track creation parameters
 * @param {number} count - Number of tracks to create
 * @param {string} type - Track type
 * @param {number|undefined} trackIndex - Track index
 * @param {number} effectiveTrackIndex - Effective track index
 */
function validateTrackCreation(count, type, trackIndex, effectiveTrackIndex) {
  if (count < 1) {
    throw new Error("createTrack failed: count must be at least 1");
  }

  if (type === "return" && trackIndex != null) {
    console.error(
      "createTrack: trackIndex is ignored for return tracks (always added at end)",
    );
  }

  if (
    type !== "return" &&
    effectiveTrackIndex >= 0 &&
    effectiveTrackIndex + count > MAX_AUTO_CREATED_TRACKS
  ) {
    throw new Error(
      `createTrack failed: creating ${count} tracks at index ${effectiveTrackIndex} would exceed the maximum allowed tracks (${MAX_AUTO_CREATED_TRACKS})`,
    );
  }
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
  const effectiveTrackIndex = trackIndex ?? -1;

  validateTrackCreation(count, type, trackIndex, effectiveTrackIndex);

  const liveSet = LiveAPI.from("live_set");
  const baseTrackCount = getBaseTrackCount(liveSet, type, effectiveTrackIndex);
  const createdTracks = [];
  let currentIndex = effectiveTrackIndex;

  const parsedNames = parseCommaSeparated(name, count);
  const parsedColors = parseCommaSeparated(color, count);

  for (let i = 0; i < count; i++) {
    const trackId = createSingleTrack(liveSet, type, currentIndex);
    const track = LiveAPI.from(`id ${trackId}`);

    track.setAll({
      name: buildTrackName(name, count, i, parsedNames),
      color: getColorForIndex(color, i, parsedColors),
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
