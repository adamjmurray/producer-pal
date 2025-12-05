import * as console from "#src/shared/v8-max-console.js";

const HOLDING_AREA_START = 40000;

/**
 * Perform shuffling of arrangement clips
 * @param {Array<LiveAPI>} arrangementClips - Array of arrangement clip objects
 * @param {Array<LiveAPI>} clips - Array to update with fresh clips after shuffling
 * @param {Set} warnings - Set to track warnings already issued
 * @param {function(): number} rng - Random number generator function
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

  // Sort clips by start_time to establish original order
  const sortedClips = [...arrangementClips].sort(
    (a, b) => a.getProperty("start_time") - b.getProperty("start_time"),
  );

  // Calculate gaps between consecutive clips (preserves original spacing pattern)
  const gaps = [];
  for (let i = 0; i < sortedClips.length - 1; i++) {
    const clipEnd =
      sortedClips[i].getProperty("start_time") +
      sortedClips[i].getProperty("length");
    const nextStart = sortedClips[i + 1].getProperty("start_time");
    gaps.push(nextStart - clipEnd);
  }

  // Shuffle clip order (not positions)
  const shuffledClips = shuffleArray(sortedClips, rng);

  // Calculate new positions: place sequentially with preserved gaps
  const startPosition = sortedClips[0].getProperty("start_time");
  let currentPos = startPosition;
  const targetPositions = shuffledClips.map((clip, i) => {
    const pos = currentPos;
    currentPos += clip.getProperty("length");
    if (i < gaps.length) currentPos += gaps[i];
    return pos;
  });

  // Move all clips to holding area first
  // Store trackIndex before entering loop (all arrangement clips are on same track)
  const trackIndexForShuffle = arrangementClips[0].trackIndex;

  const holdingPositions = shuffledClips.map((clip, index) => {
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
    return { tempClip, track, targetPosition: targetPositions[index] };
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

/**
 * Calculate target positions for shuffled clips, preserving original gap pattern.
 * @param {Array<{startTime: number, length: number}>} sortedClipInfo - Clips sorted by start time
 * @param {Array<number>} shuffledIndices - Indices into sortedClipInfo in shuffled order
 * @returns {Array<number>} Target positions for each shuffled clip
 */
export function calculateShufflePositions(sortedClipInfo, shuffledIndices) {
  // Calculate gaps between consecutive clips in original order
  const gaps = [];
  for (let i = 0; i < sortedClipInfo.length - 1; i++) {
    const clipEnd = sortedClipInfo[i].startTime + sortedClipInfo[i].length;
    const nextStart = sortedClipInfo[i + 1].startTime;
    gaps.push(nextStart - clipEnd);
  }

  // Calculate new positions: place sequentially with preserved gaps
  const startPosition = sortedClipInfo[0].startTime;
  let currentPos = startPosition;

  return shuffledIndices.map((origIndex, i) => {
    const pos = currentPos;
    currentPos += sortedClipInfo[origIndex].length;
    if (i < gaps.length) currentPos += gaps[i];
    return pos;
  });
}
