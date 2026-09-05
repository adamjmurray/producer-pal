// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";

/** The clips a call lands on one track at one position. */
export interface MoveGroup {
  trackIndex: number;
  count: number;
}

/**
 * The group a moved clip belongs to: the track it lands on and the position it
 * lands at. There is no lane in the key. The non-survivor optimization leaves
 * every take-lane route out, but the tally does not, so a take-lane landing is
 * counted against the track's group and can name a stack that isn't one.
 * @param trackIndex - The track the clip lands on
 * @param startBeats - The position it lands at, in beats
 * @returns A key for that track and position
 */
export function moveGroupKey(trackIndex: number, startBeats: number): string {
  return `${trackIndex}@${startBeats}`;
}

/**
 * Count one clip against the group it lands in.
 * @param groups - Counts per group, added to
 * @param trackIndex - The track the clip lands on
 * @param startBeats - The position it lands at, in beats
 */
export function tallyMovedClip(
  groups: Map<string, MoveGroup>,
  trackIndex: number,
  startBeats: number,
): void {
  const key = moveGroupKey(trackIndex, startBeats);
  const group = groups.get(key) ?? { trackIndex, count: 0 };

  group.count++;
  groups.set(key, group);
}

/**
 * Warn about clips this call stacked on top of each other.
 * @param groups - Counts per group, from tallyMovedClip
 */
export function emitArrangementWarnings(groups: Map<string, MoveGroup>): void {
  for (const { trackIndex, count } of groups.values()) {
    if (count > 1) {
      console.warn(
        `${count} clips on t${trackIndex} moved to the same position - later clips will overwrite earlier ones`,
      );
    }
  }
}
