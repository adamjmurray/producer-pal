// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  CHROMATIC_SCALE_MASK,
  scaleIntervalsToPitchClassMask,
} from "#src/shared/pitch.ts";

/**
 * Read the Live Set's global scale and return a pitch class bitmask for the
 * transform `scale:mask` variable. Shared by the clip create/update transform
 * paths so both expose scale snapping identically.
 * @returns Pitch class bitmask, or undefined when no scale is active or the
 *   scale is chromatic (a chromatic mask is a no-op, so skip it)
 */
export function readLiveSetScaleMask(): number | undefined {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const scaleMode = liveSet.getProperty("scale_mode") as number;

  if (scaleMode === 0) return undefined;

  const rootNote = liveSet.getProperty("root_note") as number;
  const intervals = liveSet.getProperty("scale_intervals") as number[];
  const mask = scaleIntervalsToPitchClassMask(intervals, rootNote);

  return mask === CHROMATIC_SCALE_MASK ? undefined : mask;
}
