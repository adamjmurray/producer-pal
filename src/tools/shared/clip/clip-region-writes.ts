// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** A clip's loop brace and markers, in marker units. */
export interface ClipRegion {
  loop_start: number;
  loop_end: number;
  start_marker: number;
  end_marker: number;
}

/**
 * The writes that move a clip's region, in an order Live accepts.
 *
 * A looping clip checks each write against the other three values, so the
 * four can't be ordered pair by pair. Live refuses or clamps a write that
 * leaves loop_start at or past loop_end, start_marker at or past end_marker,
 * or start_marker at or past loop_end (across the pairs). So: every end that
 * grows goes first, then both starts, then every end that shrinks. Each write
 * then lands, as long as the final region is valid.
 * @param current - The pairs' current ends
 * @param current.loop_end - The current loop_end
 * @param current.end_marker - The current end_marker
 * @param next - Where the region should end up
 * @returns The four writes, in order, for setAll
 */
export function clipRegionWrites(
  current: Pick<ClipRegion, "loop_end" | "end_marker">,
  next: ClipRegion,
): ClipRegion {
  const writes: Partial<ClipRegion> = {};

  if (endMovesFirst(next.loop_end, current.loop_end)) {
    writes.loop_end = next.loop_end;
  }

  if (endMovesFirst(next.end_marker, current.end_marker)) {
    writes.end_marker = next.end_marker;
  }

  writes.start_marker = next.start_marker;
  writes.loop_start = next.loop_start;
  // An end already written keeps its place: re-setting a key doesn't move it.
  writes.loop_end = next.loop_end;
  writes.end_marker = next.end_marker;

  return writes as ClipRegion;
}

/**
 * Whether an end must be written before the starts: it is not moving down.
 * Every start is written before an end that shrinks, and after one that grows,
 * so no start is ever written at or past an end it is about to be below.
 * @param nextEnd - Where the end is going, or null if not written
 * @param currentEnd - Where the end is now
 * @returns True to write the end before the starts
 */
export function endMovesFirst(
  nextEnd: number | null,
  currentEnd: number,
): boolean {
  return nextEnd != null && nextEnd >= currentEnd;
}
