// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What one update-clip call keeps between its targets. A target's write can't
// reach into another's, so what one clip's update has to say to the next (a
// move that didn't free its span, a span written over) rides here. It is built
// per call and dies with it: never hold a LiveAPI past the request.

import {
  type ConvertProgress,
  newConvertProgress,
} from "#src/tools/clip/convert/apply-clip-convert.ts";
import { type SplitRun } from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import {
  type LandingLog,
  newLandingLog,
} from "#src/tools/shared/clip/landings/landing-log.ts";
import {
  onceScaleMaskReader,
  type ScaleMaskReader,
} from "#src/tools/clip/helpers/scale-mask.ts";
import { type ClipReasons, newClipReasons } from "../entries/clip-reasons.ts";

/** One call's shared state. */
export interface ClipRun {
  context: Partial<ToolContext>;
  /** What each clip has to say beyond its own result */
  reasons: ClipReasons;
  /** The spans the call has written to the arrangement */
  landings: LandingLog;
  /** Destination tracks resolved so far, keyed by track index */
  destinationTracks: Map<number, LiveAPI>;
  /** Targets that were to free their span and didn't */
  stayed: Set<number>;
  /** Targets whose move and resize the call gave up on */
  calledOff: Set<number>;
  /** The Live Set's scale mask, read the first time a clip's notes need it */
  scaleMask: ScaleMaskReader;
  /** The call's cuts, once its first split clip is reached */
  split?: SplitRun;
  /** Clips whose own meter can't read the note edits, and why, by clip id */
  unreadable: Map<string, string>;
  /** How many clips the call set out to cut */
  splitCount: number;
  /** What the call's conversions know of each other */
  convert: ConvertProgress;
}

/**
 * The state for one call.
 * @param context - The request's context
 * @returns An empty run
 */
export function newClipRun(context: Partial<ToolContext>): ClipRun {
  return {
    context,
    reasons: newClipReasons(),
    landings: newLandingLog(),
    scaleMask: onceScaleMaskReader(),
    destinationTracks: new Map(),
    stayed: new Set(),
    calledOff: new Set(),
    unreadable: new Map(),
    splitCount: 0,
    convert: newConvertProgress(),
  };
}
