// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Each clip's clip.index, and the clip.count they all see. */
export interface ClipBatchIndexes {
  /** One per clip, in clip order. */
  indexes: number[];
  count: number;
}

/**
 * Number the clips across the targets in call order. A target with no clip
 * still takes one number, so the clips after it keep the place name and the
 * other per-target lists pair them with. A split target takes one per piece.
 * @param slots - The target each clip belongs to, in clip order
 * @param targetCount - How many targets the call named
 * @returns Each clip's index, and the total count
 */
export function clipBatchIndexes(
  slots: number[],
  targetCount: number,
): ClipBatchIndexes {
  const piecesPerTarget = Array.from({ length: targetCount }, () => 0);

  for (const slot of slots) {
    piecesPerTarget[slot] = (piecesPerTarget[slot] as number) + 1;
  }

  const firstIndex: number[] = [];
  let count = 0;

  for (const pieces of piecesPerTarget) {
    firstIndex.push(count);
    count += Math.max(pieces, 1);
  }

  const taken = Array.from({ length: targetCount }, () => 0);
  const indexes = slots.map((slot) => {
    const index = (firstIndex[slot] as number) + (taken[slot] as number);

    taken[slot] = (taken[slot] as number) + 1;

    return index;
  });

  return { indexes, count };
}
