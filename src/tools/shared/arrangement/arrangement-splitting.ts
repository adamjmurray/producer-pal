// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { MAX_SPLIT_POINTS } from "#src/tools/constants.ts";
import {
  createAndDeleteTempClip,
  moveClipFromHolding,
} from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import type { TilingContext } from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";

const EPSILON = 0.001;

export interface SplittingContext {
  holdingAreaStartBeats: number;
  silenceWavPath?: string;
}

interface SplitClipRange {
  trackIndex: number;
  startTime: number;
  endTime: number;
}

/**
 * Parse comma-separated bar|beat positions into beat offsets from clip start.
 * Positions use clip-local coordinates where 1|1 is the clip start.
 * @param splitStr - Comma-separated bar|beat positions (e.g., "2|1, 3|1, 4|1")
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Sorted array of beat offsets, or null if invalid
 */
function parseSplitPoints(
  splitStr: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number[] | null {
  const points: number[] = [];
  const parts = splitStr.split(",").map((s) => s.trim());

  for (const part of parts) {
    if (!part) continue;

    try {
      const beats = barBeatToAbletonBeats(
        part,
        timeSigNumerator,
        timeSigDenominator,
      );

      points.push(beats);
    } catch {
      return null;
    }
  }

  // Sort and remove duplicates
  return [...new Set(points)].sort((a, b) => a - b);
}

/**
 * Prepare split parameters by parsing comma-separated bar|beat positions.
 * @param split - Comma-separated bar|beat positions (e.g., "2|1, 3|1, 4|1")
 * @param arrangementClips - Array of arrangement clips
 * @param warnings - Set to track warnings already issued
 * @returns Array of beat offsets or null
 */
export function prepareSplitParams(
  split: string | undefined,
  arrangementClips: LiveAPI[],
  warnings: Set<string>,
): number[] | null {
  if (split == null) {
    return null;
  }

  if (arrangementClips.length === 0) {
    if (!warnings.has("split-no-arrangement")) {
      console.warn("split requires arrangement clips");
      warnings.add("split-no-arrangement");
    }

    return null;
  }

  const liveSet = LiveAPI.from("live_set");
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  const splitPoints = parseSplitPoints(
    split,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  if (splitPoints == null || splitPoints.length === 0) {
    if (!warnings.has("split-invalid-format")) {
      console.warn(
        `Invalid split format: "${split}". Expected comma-separated bar|beat positions like "2|1, 3|1"`,
      );
      warnings.add("split-invalid-format");
    }

    return null;
  }

  if (splitPoints.length > MAX_SPLIT_POINTS) {
    if (!warnings.has("split-max-exceeded")) {
      console.warn(
        `Too many split points (${splitPoints.length}), max is ${MAX_SPLIT_POINTS}`,
      );
      warnings.add("split-max-exceeded");
    }

    return null;
  }

  // Filter out points at 0 (can't split at the very start)
  const validPoints = splitPoints.filter((p) => p > 0);

  if (validPoints.length === 0) {
    if (!warnings.has("split-no-valid-points")) {
      console.warn("No valid split points (all at or before clip start)");
      warnings.add("split-no-valid-points");
    }

    return null;
  }

  return validPoints;
}

interface SplitSingleClipArgs {
  clip: LiveAPI;
  splitPoints: number[];
  holdingAreaStart: number;
  context: SplittingContext;
  splitClipRanges: Map<string, SplitClipRange>;
}

/**
 * Split a single clip at the specified points.
 * Uses an optimized algorithm for all clip types (looped/unlooped, MIDI/audio, warped/unwarped):
 * 1. Duplicate full clip once to holding area (source for extracting segments)
 * 2. Right-trim original in place to keep only segment 0
 * 3. Extract middle segments 1..N-2 from source copies (left+right edge trims)
 * 4. Left-trim source to isolate last segment, move to final position
 *
 * This uses 2(N-1) duplications instead of 2N by keeping segment 0 in place
 * and reusing the source copy for the last segment.
 * @param args - Arguments for splitting
 * @returns true if splitting succeeded, false if skipped
 */
function splitSingleClip(args: SplitSingleClipArgs): boolean {
  const { clip, splitPoints, holdingAreaStart, context } = args;
  const { splitClipRanges } = args;

  const isMidiClip = clip.getProperty("is_midi_clip") === 1;
  const clipArrangementStart = clip.getProperty("start_time") as number;
  const clipArrangementEnd = clip.getProperty("end_time") as number;
  const clipLength = clipArrangementEnd - clipArrangementStart;

  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    console.warn(
      `Could not determine trackIndex for clip ${clip.id}, skipping`,
    );

    return false;
  }

  // Filter split points to those within clip bounds
  const validPoints = splitPoints.filter((p) => p > 0 && p < clipLength);

  if (validPoints.length === 0) {
    return false;
  }

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
  const originalClipId = clip.id;

  splitClipRanges.set(originalClipId, {
    trackIndex,
    startTime: clipArrangementStart,
    endTime: clipArrangementEnd,
  });

  // Create boundaries: [0, ...splitPoints, clipLength]
  const boundaries = [0, ...validPoints, clipLength];
  const segmentCount = boundaries.length - 1;
  const tilingCtx = context as TilingContext;

  // Step 1: Duplicate original once to holding as source
  const sourcePos = holdingAreaStart;
  const result = track.call(
    "duplicate_clip_to_arrangement",
    toLiveApiId(originalClipId),
    sourcePos,
  ) as [string, string | number];
  const sourceClip = LiveAPI.from(result);

  if (!sourceClip.exists()) {
    console.warn(
      `Failed to duplicate clip ${originalClipId} to holding area, aborting split`,
    );

    return false;
  }

  const sourceClipId = sourceClip.id;

  // Step 2: Right-trim original to keep only segment 0
  const seg0End = boundaries[1] as number; // boundaries has >= 3 elements
  const rightTrimLen = clipLength - seg0End;

  if (rightTrimLen > EPSILON) {
    createAndDeleteTempClip(
      track,
      clipArrangementStart + seg0End,
      rightTrimLen,
      isMidiClip,
      tilingCtx,
    );
  }

  // Step 3: Extract middle segments (1 to N-2) from source copies
  extractMiddleSegments({
    track,
    sourceClipId,
    boundaries,
    segmentCount,
    clipArrangementStart,
    clipLength,
    holdingAreaStart,
    isMidiClip,
    context: tilingCtx,
  });

  // Step 4: Left-trim source to isolate last segment, move to final position
  const lastSegStart = boundaries[segmentCount - 1] as number; // loop bounds guarantee valid
  const lastSegFinalPos = clipArrangementStart + lastSegStart;

  if (lastSegStart > EPSILON) {
    createAndDeleteTempClip(
      track,
      sourcePos,
      lastSegStart,
      isMidiClip,
      tilingCtx,
    );
  }

  moveClipFromHolding(sourceClipId, track, lastSegFinalPos);

  return true;
}

interface ExtractMiddleSegmentsArgs {
  track: LiveAPI;
  sourceClipId: string;
  boundaries: number[];
  segmentCount: number;
  clipArrangementStart: number;
  clipLength: number;
  holdingAreaStart: number;
  isMidiClip: boolean;
  context: TilingContext;
}

/**
 * Extract middle segments (indices 1 to N-2) by duplicating source, edge-trimming, and moving.
 * Skips segments whose duplication fails (partial-success model).
 * @param args - Extraction arguments
 */
function extractMiddleSegments(args: ExtractMiddleSegmentsArgs): void {
  const {
    track,
    sourceClipId,
    boundaries,
    segmentCount,
    clipArrangementStart,
    clipLength,
    holdingAreaStart,
    isMidiClip,
    context,
  } = args;

  for (let i = 1; i < segmentCount - 1; i++) {
    const segStart = boundaries[i] as number; // loop bounds guarantee valid index
    const segEnd = boundaries[i + 1] as number; // loop bounds guarantee valid index

    // Duplicate source to working position
    const workPos = holdingAreaStart + i * (clipLength + 4);
    const workResult = track.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sourceClipId),
      workPos,
    ) as [string, string | number];
    const workClipId = LiveAPI.from(workResult).id;

    if (workClipId === "0") {
      console.warn(
        `Failed to duplicate source for middle segment ${i}, skipping`,
      );
      continue;
    }

    // Left-trim to remove content before this segment
    if (segStart > EPSILON) {
      createAndDeleteTempClip(track, workPos, segStart, isMidiClip, context);
    }

    // Right-trim to remove content after this segment
    const rightTrim = clipLength - segEnd;

    if (rightTrim > EPSILON) {
      createAndDeleteTempClip(
        track,
        workPos + segEnd,
        rightTrim,
        isMidiClip,
        context,
      );
    }

    // Move to final arrangement position
    moveClipFromHolding(workClipId, track, clipArrangementStart + segStart);
  }
}

/**
 * Re-scan tracks to replace stale clip objects with fresh ones.
 * @param splitClipRanges - Map of original clip IDs to their ranges
 * @param clips - Array to update with fresh clips
 */
function rescanSplitClips(
  splitClipRanges: Map<string, SplitClipRange>,
  clips: LiveAPI[],
): void {
  for (const [oldClipId, range] of splitClipRanges) {
    const track = LiveAPI.from(`live_set tracks ${range.trackIndex}`);
    const trackClipIds = track.getChildIds("arrangement_clips");
    const freshClips = trackClipIds
      .map((id) => LiveAPI.from(id))
      .filter((c) => {
        const clipStart = c.getProperty("start_time") as number;

        return (
          clipStart >= range.startTime - EPSILON &&
          clipStart < range.endTime - EPSILON
        );
      });

    const staleIndex = clips.findIndex((c) => c.id === oldClipId);

    if (staleIndex !== -1) {
      clips.splice(staleIndex, 1, ...freshClips);
    }
  }
}

/**
 * Perform splitting of arrangement clips at specified positions.
 *
 * Uses partial-success model: if a clip fails to split, it is skipped and a
 * warning is emitted. This is consistent with update-clip error handling patterns.
 *
 * @param arrangementClips - Array of arrangement clips to split
 * @param splitPoints - Array of beat offsets from clip start (relative to 1|1)
 * @param clips - Array to update with fresh clips after splitting
 * @param _context - Internal context object
 */
export function performSplitting(
  arrangementClips: LiveAPI[],
  splitPoints: number[],
  clips: LiveAPI[],
  _context: SplittingContext,
): void {
  const holdingAreaStart = _context.holdingAreaStartBeats;
  const splitClipRanges = new Map<string, SplitClipRange>();

  for (const clip of arrangementClips) {
    splitSingleClip({
      clip,
      splitPoints,
      holdingAreaStart,
      context: _context,
      splitClipRanges,
    });
  }

  rescanSplitClips(splitClipRanges, clips);
}
