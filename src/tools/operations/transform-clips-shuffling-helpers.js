import * as console from "../../shared/v8-max-console.js";

const HOLDING_AREA_START = 40000;

/**
 *
 * @param arrangementClips
 * @param clips
 * @param warnings
 * @param rng
 */
export function performShuffling(arrangementClips, clips, warnings, rng) {
  if (arrangementClips.length === 0) {
    if (!warnings.has("shuffle-no-arrangement")) {
      console.error("Warning: shuffleOrder requires arrangement clips");
      warnings.add("shuffle-no-arrangement");
    }
    return;
  }
  if (arrangementClips.length <= 1) {
    return;
  }
  // Read original positions
  const positions = arrangementClips.map((clip) =>
    clip.getProperty("start_time"),
  );
  // Shuffle positions
  const shuffledPositions = shuffleArray(positions, rng);
  // Move all clips to holding area first
  // Store trackIndex before entering loop (all arrangement clips are on same track)
  const trackIndexForShuffle = arrangementClips[0].trackIndex;
  const holdingPositions = arrangementClips.map((clip, index) => {
    const trackIndex = clip.trackIndex;
    const track = new LiveAPI(`live_set tracks ${trackIndex}`);
    const holdingPos = HOLDING_AREA_START + index * 100;
    const result = track.call(
      "duplicate_clip_to_arrangement",
      `id ${clip.id}`,
      holdingPos,
    );
    const tempClip = LiveAPI.from(result);
    // Delete original
    track.call("delete_clip", `id ${clip.id}`);
    return { tempClip, track, targetPosition: shuffledPositions[index] };
  });

  // Move clips from holding area to shuffled positions
  for (const { tempClip, track, targetPosition } of holdingPositions) {
    track.call(
      "duplicate_clip_to_arrangement",
      `id ${tempClip.id}`,
      targetPosition,
    );
    track.call("delete_clip", `id ${tempClip.id}`);
  }
  // After shuffling, the clips in the array are stale (they were deleted and recreated)
  // Re-scan to get fresh clip objects
  const track = new LiveAPI(`live_set tracks ${trackIndexForShuffle}`);
  const freshClipIds = track.getChildIds("arrangement_clips");
  const freshClips = freshClipIds.map((id) => LiveAPI.from(id));
  // Replace all stale clips with fresh ones
  clips.length = 0;
  clips.push(...freshClips);
}

/**
 * Shuffles an array using Fisher-Yates algorithm with seeded RNG
 * @param {Array} array - Array to shuffle
 * @param {function(): number} rng - Random number generator function
 * @returns {Array} Shuffled array
 */
export function shuffleArray(array, rng) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
