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
  /** Where the clip is, e.g. "t1[5|1]" or "t1/l0[5|1]". */
  path?: string;
}

/** The `[song position]` an arrangement clip's path ends with. */
const COORDINATE = /\[([^\]]*)\]$/;

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
 * Bar positions of a clip list, in bar order, read out of each clip's path.
 * Missing positions read as "?" so a failure message shows the gap rather than
 * dropping the clip.
 *
 * @param clips - Clips from a read-track result
 * @returns Sorted bar|beat positions
 */
export function clipStarts(clips: ArrangementClip[] | undefined): string[] {
  return (clips ?? [])
    .map((clip) => COORDINATE.exec(clip.path ?? "")?.[1] ?? "?")
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

/**
 * Whether a clip call put its clip on the song timeline: a `[position]`
 * coordinate on the destination path, or the deprecated `arrangementStart` a
 * caller may still send.
 *
 * @param args - The tool call's arguments
 * @param destinationParam - "path" on create-clip, "toPath" on duplicate
 * @returns True when the call names an arrangement position
 */
export function callNamesArrangementPosition(
  args: Record<string, unknown>,
  destinationParam: "path" | "toPath",
): boolean {
  const destination = args[destinationParam];

  return (
    (typeof destination === "string" && destination.includes("[")) ||
    Boolean(args.arrangementStart)
  );
}
