// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The entries a destination keeps when no copy landed at it, addressed the way
// a copy that landed there would be.

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  type ClearedCopy,
  clearedCopy,
  skippedCopy,
} from "../minimal-clip-info.ts";

/** The song meter a destination's position is spelled in. */
export interface CopyMeter {
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
}

/** Where one copy is headed, for the entry that reports it. */
export interface UnreachedDestination {
  /** Where it was going, in Ableton beats */
  beats: number;
  /** Which destination, e.g. "t0" or "t0/l3". Omitted when there is only one. */
  label?: string;
}

/**
 * The entry a destination that got no copy keeps, addressed the way a copy that
 * landed there would have been.
 * @param destination - Where the copy was headed: the lane, and the position
 * @param meter - The song time signature, for spelling the position
 * @param reason - Why no copy landed there
 * @returns The skip entry
 */
export function refusedCopy(
  destination: UnreachedDestination,
  meter: CopyMeter,
  reason: string,
): TargetSkip {
  return skippedCopy(destinationPath(destination, meter), reason);
}

/**
 * The entry for a destination Live made no copy at after the landing had
 * already cleared clips there. The Set changed, so it counts as landed: a
 * normal entry with a detail, and no `ok: false`.
 * @param destination - Where the copy was headed: the lane, and the position
 * @param meter - The song time signature, for spelling the position
 * @param detail - Why no copy landed, and what was cleared
 * @returns The entry
 */
export function clearedWithoutCopy(
  destination: UnreachedDestination,
  meter: CopyMeter,
  detail: string,
): ClearedCopy {
  return clearedCopy(destinationPath(destination, meter), detail);
}

/**
 * The path a copy headed for a destination would have reported.
 * @param destination - Where a copy was headed
 * @param meter - The song time signature, for spelling the position
 * @param meter.songTimeSigNumerator - Numerator
 * @param meter.songTimeSigDenominator - Denominator
 * @returns The path a copy there would have reported
 */
export function destinationPath(
  destination: UnreachedDestination,
  { songTimeSigNumerator, songTimeSigDenominator }: CopyMeter,
): string {
  const position = abletonBeatsToBarBeat(
    destination.beats,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  return `${destination.label ?? ""}[${position}]`;
}
