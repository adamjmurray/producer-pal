import * as console from "#src/shared/v8-max-console.js";

/**
 * Perform shuffling of arrangement clips
 * @param {Array<LiveAPI>} arrangementClips - Array of arrangement clip objects
 * @param {Array<LiveAPI>} clips - Array to update with fresh clips after shuffling
 * @param {Set<string>} warnings - Set to track warnings already issued
 * @param {function(): number} rng - Random number generator function
 * @param {{ holdingAreaStartBeats: number }} context - Context object with holdingAreaStartBeats
 */
export function performShuffling(
  arrangementClips,
  clips,
  warnings,
  rng,
  context,
) {
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
    (a, b) =>
      /** @type {number} */ (a.getProperty("start_time")) -
      /** @type {number} */ (b.getProperty("start_time")),
  );

  // Calculate gaps between consecutive clips (preserves original spacing pattern)
  /** @type {number[]} */
  const gaps = [];

  for (let i = 0; i < sortedClips.length - 1; i++) {
    const clipEnd =
      /** @type {number} */ (sortedClips[i].getProperty("start_time")) +
      /** @type {number} */ (sortedClips[i].getProperty("length"));
    const nextStart = /** @type {number} */ (
      sortedClips[i + 1].getProperty("start_time")
    );

    gaps.push(nextStart - clipEnd);
  }

  // Shuffle clip order (not positions)
  const shuffledClips = shuffleArray(sortedClips, rng);

  // Calculate new positions: place sequentially with preserved gaps
  const startPosition = /** @type {number} */ (
    sortedClips[0].getProperty("start_time")
  );
  let currentPos = startPosition;
  const targetPositions = shuffledClips.map((clip, i) => {
    const pos = currentPos;

    currentPos += /** @type {number} */ (clip.getProperty("length"));
    if (i < gaps.length) currentPos += gaps[i];

    return pos;
  });

  // Move all clips to holding area first
  // Store trackIndex before entering loop (all arrangement clips are on same track)
  const trackIndexForShuffle = arrangementClips[0].trackIndex;

  const holdingPositions = shuffledClips.map((clip, index) => {
    const trackIndex = clip.trackIndex;
    const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
    const holdingPos = context.holdingAreaStartBeats + index * 100;
    const result = /** @type {string} */ (
      track.call("duplicate_clip_to_arrangement", `id ${clip.id}`, holdingPos)
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
  const track = LiveAPI.from(`live_set tracks ${trackIndexForShuffle}`);
  const freshClipIds = track.getChildIds("arrangement_clips");
  const freshClips = freshClipIds.map((id) => LiveAPI.from(id));

  // Replace all stale clips with fresh ones
  clips.length = 0;
  clips.push(...freshClips);
}

/**
 * Shuffles an array using Fisher-Yates algorithm with seeded RNG
 * @template T
 * @param {Array<T>} array - Array to shuffle
 * @param {function(): number} rng - Random number generator function
 * @returns {Array<T>} Shuffled array
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
  /** @type {number[]} */
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
