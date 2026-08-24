// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Reading a track's arrangement out of a `ppal-read-track` result, for
 * scenarios that grade where clips landed on the timeline.
 */

/** One clip in a read-track result. */
export interface ArrangementClip {
  arrangementStart?: string;
}

/** One take lane in a read-track result. */
export interface TakeLane {
  /** The lane's own path, e.g. "t1/l0". */
  path?: string;
  clips?: ArrangementClip[];
}

/** The arrangement half of a read-track result. */
export interface ArrangementTrack {
  arrangementClips?: ArrangementClip[];
  takeLanes?: TakeLane[];
}

/**
 * Bar positions of a clip list, in bar order. Missing positions read as "?" so
 * a failure message shows the gap rather than dropping the clip.
 *
 * @param clips - Clips from a read-track result
 * @returns Sorted arrangementStart values
 */
export function clipStarts(clips: ArrangementClip[] | undefined): string[] {
  return (clips ?? [])
    .map((clip) => clip.arrangementStart ?? "?")
    .toSorted(
      (a, b) => Number(a.split("|")[0] ?? 0) - Number(b.split("|")[0] ?? 0),
    );
}

/**
 * View a parsed read-track result as an arrangement.
 *
 * @param result - Parsed ppal-read-track result
 * @returns The same value, typed
 */
export function asArrangementTrack(result: unknown): ArrangementTrack {
  return result as ArrangementTrack;
}

/**
 * The track's take lanes, or an empty list when it has none.
 *
 * @param result - Parsed ppal-read-track result
 * @returns Take lane entries
 */
export function takeLanes(result: unknown): TakeLane[] {
  return asArrangementTrack(result).takeLanes ?? [];
}
