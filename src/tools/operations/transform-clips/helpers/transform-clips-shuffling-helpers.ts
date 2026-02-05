// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";

/**
 * Perform shuffling of arrangement clips.
 *
 * Uses hard failure (throws) since shuffle requires all-or-nothing semantics.
 * Note: If a failure occurs mid-operation, clips may be left in the holding area
 * (at positions starting from holdingAreaStartBeats). This is a known limitation
 * as implementing rollback would add significant complexity.
 *
 * @param arrangementClips - Array of arrangement clip objects
 * @param clips - Array to update with fresh clips after shuffling
 * @param warnings - Set to track warnings already issued
 * @param rng - Random number generator function
 * @param context - Context object with holdingAreaStartBeats
 * @param context.holdingAreaStartBeats - Start position for temporary holding area
 * @throws Error if clip duplication fails during shuffle
 */
export function performShuffling(
  arrangementClips: LiveAPI[],
  clips: LiveAPI[],
  warnings: Set<string>,
  rng: () => number,
  context: { holdingAreaStartBeats: number },
): void {
  if (arrangementClips.length === 0) {
    if (!warnings.has("shuffle-no-arrangement")) {
      console.warn("shuffleOrder requires arrangement clips");
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
      (a.getProperty("start_time") as number) -
      (b.getProperty("start_time") as number),
  );

  // Calculate gaps between consecutive clips (preserves original spacing pattern)
  const gaps: number[] = [];

  for (let i = 0; i < sortedClips.length - 1; i++) {
    const currentClip = sortedClips[i] as LiveAPI;
    const nextClip = sortedClips[i + 1] as LiveAPI;
    const clipEnd =
      (currentClip.getProperty("start_time") as number) +
      (currentClip.getProperty("length") as number);
    const nextStart = nextClip.getProperty("start_time") as number;

    gaps.push(nextStart - clipEnd);
  }

  // Shuffle clip order (not positions)
  const shuffledClips = shuffleArray(sortedClips, rng);

  // Calculate new positions: place sequentially with preserved gaps
  const firstSortedClip = sortedClips[0] as LiveAPI;
  const startPosition = firstSortedClip.getProperty("start_time") as number;
  let currentPos = startPosition;
  const targetPositions = shuffledClips.map((clip, i) => {
    const pos = currentPos;

    currentPos += clip.getProperty("length") as number;
    if (i < gaps.length) currentPos += gaps[i] as number;

    return pos;
  });

  // Move all clips to holding area first
  // Track all track indices for multi-track support
  const seenTrackIndices = new Set<number>();

  const holdingPositions = shuffledClips.map((clip, index) => {
    const trackIndex = clip.trackIndex;

    if (trackIndex != null) {
      seenTrackIndices.add(trackIndex);
    }

    const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
    const holdingPos = context.holdingAreaStartBeats + index * 100;
    const result = track.call(
      "duplicate_clip_to_arrangement",
      clip.id,
      holdingPos,
    ) as string;
    const tempClip = LiveAPI.from(result);

    // Verify duplicate succeeded before deleting original
    if (!tempClip.exists()) {
      throw new Error(`Failed to duplicate clip ${clip.id} during shuffle`);
    }

    // Delete original
    track.call("delete_clip", clip.id);

    return {
      tempClip,
      track,
      targetPosition: targetPositions[index] as number,
    };
  });

  // Move clips from holding area to shuffled positions
  for (const { tempClip, track, targetPosition } of holdingPositions) {
    const finalResult = track.call(
      "duplicate_clip_to_arrangement",
      tempClip.id,
      targetPosition,
    ) as string;
    const finalClip = LiveAPI.from(finalResult);

    // Verify duplicate succeeded before deleting temp clip
    if (!finalClip.exists()) {
      throw new Error(
        `Failed to move clip ${tempClip.id} from holding during shuffle`,
      );
    }

    track.call("delete_clip", tempClip.id);
  }

  // After shuffling, the clips in the array are stale (they were deleted and recreated)
  // Re-scan ALL tracks that had clips (not just the first track)
  const allFreshClips: LiveAPI[] = [];

  for (const trackIndex of seenTrackIndices) {
    const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
    const freshClipIds = track.getChildIds("arrangement_clips");

    allFreshClips.push(...freshClipIds.map((id) => LiveAPI.from(id)));
  }

  // Replace all stale clips with fresh ones
  clips.length = 0;
  clips.push(...allFreshClips);
}

/**
 * Shuffles an array using Fisher-Yates algorithm with seeded RNG
 * @param array - Array to shuffle
 * @param rng - Random number generator function
 * @returns Shuffled array
 */
export function shuffleArray<T>(array: T[], rng: () => number): T[] {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = shuffled[i];

    shuffled[i] = shuffled[j] as T;
    shuffled[j] = temp as T;
  }

  return shuffled;
}

interface ClipInfo {
  startTime: number;
  length: number;
}

/**
 * Calculate target positions for shuffled clips, preserving original gap pattern.
 * @param sortedClipInfo - Clips sorted by start time
 * @param shuffledIndices - Indices into sortedClipInfo in shuffled order
 * @returns Target positions for each shuffled clip
 */
export function calculateShufflePositions(
  sortedClipInfo: ClipInfo[],
  shuffledIndices: number[],
): number[] {
  // Calculate gaps between consecutive clips in original order
  const gaps: number[] = [];

  for (let i = 0; i < sortedClipInfo.length - 1; i++) {
    const currentInfo = sortedClipInfo[i] as ClipInfo;
    const nextInfo = sortedClipInfo[i + 1] as ClipInfo;
    const clipEnd = currentInfo.startTime + currentInfo.length;
    const nextStart = nextInfo.startTime;

    gaps.push(nextStart - clipEnd);
  }

  // Calculate new positions: place sequentially with preserved gaps
  const firstInfo = sortedClipInfo[0] as ClipInfo;
  const startPosition = firstInfo.startTime;
  let currentPos = startPosition;

  return shuffledIndices.map((origIndex, i) => {
    const pos = currentPos;
    const clipInfo = sortedClipInfo[origIndex] as ClipInfo;

    currentPos += clipInfo.length;
    if (i < gaps.length) currentPos += gaps[i] as number;

    return pos;
  });
}
