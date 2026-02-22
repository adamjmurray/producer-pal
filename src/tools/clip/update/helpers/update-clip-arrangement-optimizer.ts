// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Optimization for multi-clip arrangement start moves.
 *
 * When multiple clips on the same track are moved to the same position,
 * later clips overwrite earlier ones. This module determines which clips
 * "survive" (contribute to the final arrangement state) so non-survivors
 * can be deleted without the expensive duplicate+move operation.
 */

interface ClipMoveInfo {
  clipId: string;
  clipLength: number;
}

/**
 * Determine which clips will not survive when multiple clips are moved to
 * the same arrangement position. Walks backwards through clips in ID order
 * per track, tracking maximum length seen. A clip survives only if its
 * length exceeds all clips after it (because later clips placed at the
 * same position overwrite earlier ones up to their length).
 *
 * By construction, survivors in ID order are always in descending length:
 * the longest clip is first, each subsequent survivor is shorter and
 * "stacks on top" at the target position.
 *
 * Returns null when optimization doesn't apply:
 * - No arrangementStart set
 * - arrangementLength also set (tiling interaction is complex)
 * - Only single clips per track (nothing to optimize)
 * - No non-survivors found (all clips contribute)
 *
 * @param clips - Clips in the order they will be processed (ID order)
 * @param arrangementStartBeats - Target position in beats
 * @param arrangementLengthBeats - Target length (must be null for optimization)
 * @returns Set of non-survivor clip IDs, or null if optimization doesn't apply
 */
export function computeNonSurvivorClipIds(
  clips: LiveAPI[],
  arrangementStartBeats: number | null | undefined,
  arrangementLengthBeats: number | null | undefined,
): Set<string> | null {
  if (arrangementStartBeats == null || arrangementLengthBeats != null) {
    return null;
  }

  // Group arrangement clips by track (clips on different tracks don't interact)
  const trackClips = new Map<number, ClipMoveInfo[]>();

  for (const clip of clips) {
    if ((clip.getProperty("is_arrangement_clip") as number) <= 0) continue;

    const trackIndex = clip.trackIndex;

    if (trackIndex == null) continue;

    const startTime = clip.getProperty("start_time") as number;
    const endTime = clip.getProperty("end_time") as number;

    const group = trackClips.get(trackIndex) ?? [];

    group.push({ clipId: clip.id, clipLength: endTime - startTime });
    trackClips.set(trackIndex, group);
  }

  // Only optimize tracks with multiple clips
  let hasMultiClipTrack = false;

  for (const group of trackClips.values()) {
    if (group.length > 1) {
      hasMultiClipTrack = true;
      break;
    }
  }

  if (!hasMultiClipTrack) return null;

  // Backwards scan per track: a clip survives if its length > all after it
  const nonSurvivorIds = new Set<string>();

  for (const group of trackClips.values()) {
    if (group.length <= 1) continue;

    let maxLengthAfter = 0;

    for (let i = group.length - 1; i >= 0; i--) {
      // Loop bounds guarantee valid index
      const info = group[i] as ClipMoveInfo;

      if (info.clipLength > maxLengthAfter) {
        maxLengthAfter = info.clipLength;
      } else {
        nonSurvivorIds.add(info.clipId);
      }
    }
  }

  return nonSurvivorIds.size > 0 ? nonSurvivorIds : null;
}
