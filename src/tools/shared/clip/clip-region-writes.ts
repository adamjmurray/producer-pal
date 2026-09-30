// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** A clip's loop brace and markers, in marker units. */
export interface ClipRegion {
  loop_start: number;
  loop_end: number;
  start_marker: number;
  end_marker: number;
}

/**
 * The writes that move a clip's region, in an order Live accepts (see
 * endMovesFirst).
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
  const loopEndFirst = endMovesFirst(next.loop_start, current.loop_end);
  const markerEndFirst = endMovesFirst(next.start_marker, current.end_marker);
  const writes: Partial<ClipRegion> = {};

  if (loopEndFirst) {
    writes.loop_end = next.loop_end;
  }

  if (markerEndFirst) {
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
 * Whether a start/end pair (loop brace or markers) must move its end first.
 *
 * Live rejects a loop_start past loop_end and silently drops a start_marker
 * past end_marker. So a pair writes its start first, unless the new start is
 * at or past the pair's current end. Either way every write lands, as long as
 * the new start is before the new end. The loop brace and the markers can sit
 * apart, so each pair decides alone.
 * @param nextStart - Where the pair's start is going, or null if not written
 * @param currentEnd - Where the pair's end is now
 * @returns True to write the end before the start
 */
export function endMovesFirst(
  nextStart: number | null,
  currentEnd: number,
): boolean {
  return nextStart != null && nextStart >= currentEnd;
}
