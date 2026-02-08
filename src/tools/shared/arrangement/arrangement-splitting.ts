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
 * Uses a unified algorithm for all clip types (looped/unlooped, MIDI/audio, warped/unwarped):
 * 1. Duplicate full clip to holding area once per segment
 * 2. Trim each copy from right and/or left using temp clip overlay
 * 3. Delete original clip
 * 4. Move trimmed segments to final arrangement positions
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
  const EPSILON = 0.001;

  // Phase 1: Duplicate full clip once per segment to holding area
  const holdingClipIds: string[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const holdingPos = holdingAreaStart + i * (clipLength + 4);
    const result = track.call(
      "duplicate_clip_to_arrangement",
      `id ${originalClipId}`,
      holdingPos,
    ) as [string, string | number];
    const holdingClip = LiveAPI.from(result);

    if (holdingClip.id === "0") {
      console.warn(
        `Failed to duplicate clip ${originalClipId} to holding area, aborting split`,
      );

      // Clean up any already-created holding clips
      for (const id of holdingClipIds) {
        track.call("delete_clip", `id ${id}`);
      }

      return false;
    }

    holdingClipIds.push(holdingClip.id);
  }

  // Phase 2: Trim each copy to its segment boundaries
  const segments: Array<{ id: string; position: number }> = [];

  for (let i = 0; i < segmentCount; i++) {
    const segStart = boundaries[i] as number; // loop bounds guarantee valid index
    const segEnd = boundaries[i + 1] as number; // loop bounds guarantee valid index
    const holdingPos = holdingAreaStart + i * (clipLength + 4);
    const holdingClipId = holdingClipIds[i] as string; // loop bounds guarantee valid index

    // Trim from right (skip for last segment — it already ends at clipLength)
    const rightTrimLength = clipLength - segEnd;

    if (rightTrimLength > EPSILON) {
      createAndDeleteTempClip(
        track,
        holdingPos + segEnd,
        rightTrimLength,
        isMidiClip,
        context as TilingContext,
      );
    }

    // Trim from left (skip for first segment — it already starts at 0)
    if (segStart > EPSILON) {
      createAndDeleteTempClip(
        track,
        holdingPos,
        segStart,
        isMidiClip,
        context as TilingContext,
      );
    }

    segments.push({
      id: holdingClipId,
      position: clipArrangementStart + segStart,
    });
  }

  // Phase 3: Delete original clip BEFORE moving segments to avoid crash
  track.call("delete_clip", `id ${originalClipId}`);

  // Phase 4: Move each trimmed segment to its final arrangement position
  for (const { id, position } of segments) {
    moveClipFromHolding(id, track, position);
  }

  return true;
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
  const EPSILON = 0.001;

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
