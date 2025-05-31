// src/tools/create-track.js
import { withoutNulls } from "../utils.js";
import { MAX_AUTO_CREATED_TRACKS } from "./constants.js";

/**
 * Creates new tracks at the specified index
 * @param {Object} args - The track parameters
 * @param {number} args.trackIndex - Track index (0-based) where to insert new tracks
 * @param {number} [args.count=1] - Number of tracks to create
 * @param {string} [args.name] - Base name for the tracks
 * @param {string} [args.color] - Color for the tracks (CSS format: hex)
 * @param {string} [args.type="midi"] - Type of tracks to create ("midi" or "audio")
 * @param {boolean} [args.mute] - Mute state for the tracks
 * @param {boolean} [args.solo] - Solo state for the tracks
 * @param {boolean} [args.arm] - Arm state for the tracks
 * @returns {Object|Array<Object>} Single track object when count=1, array when count>1
 */
export function createTrack({ trackIndex, count = 1, name, color, type = "midi", mute, solo, arm } = {}) {
  if (trackIndex == null) {
    throw new Error("createTrack failed: trackIndex is required");
  }

  if (count < 1) {
    throw new Error("createTrack failed: count must be at least 1");
  }

  if (!["midi", "audio"].includes(type)) {
    throw new Error('createTrack failed: type must be "midi" or "audio"');
  }

  const liveSet = new LiveAPI("live_set");

  if (trackIndex + count > MAX_AUTO_CREATED_TRACKS) {
    throw new Error(
      `createTrack failed: creating ${count} tracks at index ${trackIndex} would exceed the maximum allowed tracks (${MAX_AUTO_CREATED_TRACKS})`
    );
  }

  const createdTracks = [];
  let currentIndex = trackIndex;

  for (let i = 0; i < count; i++) {
    // Create track at the specified index (Live API will shift existing tracks right)
    const result =
      type === "midi"
        ? liveSet.call("create_midi_track", currentIndex)
        : liveSet.call("create_audio_track", currentIndex);

    const trackId = result[1]; // Live API returns ["id", "123"]
    const track = new LiveAPI(`id ${trackId}`);

    // Build the track name
    const trackName = name != null ? (count === 1 ? name : i === 0 ? name : `${name} ${i + 1}`) : undefined;

    track.setAll({
      name: trackName,
      color,
      mute,
      solo,
      arm,
    });

    // Build optimistic result object  
    createdTracks.push(
      withoutNulls({
        id: trackId,
        trackIndex: currentIndex,
        type,
        name: trackName,
        color,
        mute,
        solo,
        arm,
      })
    );

    // For subsequent tracks, increment the index since tracks shift right
    currentIndex++;
  }

  // Return single object if count=1, array if count>1
  return count === 1 ? createdTracks[0] : createdTracks;
}
