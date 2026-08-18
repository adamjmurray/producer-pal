// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  createAndDeleteTempClip,
  EPSILON,
  type TilingContext,
} from "#src/tools/shared/arrangement/arrangement-tiling-helpers.ts";
import { moveClipFromHolding } from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";

export interface SplittingContext {
  holdingAreaStartBeats: number;
  silenceWavPath?: string;
  /** When the request's budget runs out; set once per request by the adapter. */
  deadline?: number | null;
}

/**
 * How a split request's positions are read, and what to call it in warnings.
 * The two params parse identically (song meter) and differ only here.
 */
export interface SplitMode {
  /** The param the caller used. */
  param: "arrangementSplit" | "split";
  /** "song" = positions on the song timeline; "clip" = offsets from clip start. */
  origin: "song" | "clip";
}

export const ARRANGEMENT_SPLIT_MODE: SplitMode = {
  param: "arrangementSplit",
  origin: "song",
};

/** Deprecated `split`: positions measured from each clip's own start. */
export const LEGACY_SPLIT_MODE: SplitMode = { param: "split", origin: "clip" };

interface SplitClipRange {
  trackIndex: number;
  startTime: number;
  endTime: number;
}

/** A clip no split point fell inside, held until the whole call is known. */
interface SplitMiss {
  clipId: string;
  clipArrangementStart: number;
  clipLength: number;
}

interface SplitSingleClipArgs {
  clip: LiveAPI;
  splitPoints: number[];
  mode: SplitMode;
  holdingAreaStart: number;
  context: SplittingContext;
  splitClipRanges: Map<string, SplitClipRange>;
  misses: SplitMiss[];
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
  const { clip, splitPoints, mode, holdingAreaStart, context } = args;
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

  // Song-timeline positions become offsets from this clip's start; the
  // deprecated `split` param already gives offsets. Everything below is
  // clip-relative.
  const offsets =
    mode.origin === "song"
      ? splitPoints.map((p) => p - clipArrangementStart)
      : splitPoints;

  // Filter split points to those within clip bounds.
  //
  // The margin is EPSILON, not 0, and it is load-bearing: the trims below are
  // all guarded by `> EPSILON`, so a point within EPSILON of either edge would
  // let one of them be skipped, and a skipped trim leaves a span the moves
  // below assume was vacated still occupied. Those moves skip the overlap
  // clear, so Live would crash on the next duplicate. Keep the two thresholds
  // equal. Such a point asks for a zero-length segment anyway.
  const validPoints = offsets.filter(
    (p) => p > EPSILON && p < clipLength - EPSILON,
  );

  if (validPoints.length === 0) {
    args.misses.push({ clipId: clip.id, clipArrangementStart, clipLength });

    return false;
  }

  const track = LiveAPI.from(livePath.track(trackIndex));
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

  // Step 2: Right-trim original to keep only segment 0. This is what vacates
  // the rest of the clip's span, which is why the moves below can skip the
  // overlap clear. The validPoints margin guarantees it runs.
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
  const tailSegment = extractMiddleSegments({
    track,
    clipId: originalClipId,
    sourceClipId,
    boundaries,
    segmentCount,
    clipArrangementStart,
    clipLength,
    holdingAreaStart,
    isMidiClip,
    context: tilingCtx,
  });

  // Step 4: Left-trim source to isolate the tail, move to final position. The
  // tail is the last segment unless the deadline stopped step 3 early, in which
  // case it is everything from there on, put back as one clip.
  const lastSegStart = boundaries[tailSegment] as number; // loop bounds guarantee valid
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

  // Same reason as the middle segments: the target is inside the vacated span,
  // so the scan would find nothing.
  moveClipFromHolding(
    sourceClipId,
    track,
    lastSegFinalPos,
    isMidiClip,
    tilingCtx,
    true,
  );

  return true;
}

/**
 * Warn that nothing was cut, naming the span the caller should have aimed at in
 * whichever coordinates it used.
 *
 * Only fires when no clip in the call took a cut. Cutting several clips at one
 * song position is what `arrangementSplit` is for, so the clips that position
 * misses are the expected case, not something to report.
 * @param misses - The clips no split point fell inside
 * @param mode - How the caller's positions are read
 */
function warnNothingSplit(misses: SplitMiss[], mode: SplitMode): void {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const numerator = liveSet.getProperty("signature_numerator") as number;
  const denominator = liveSet.getProperty("signature_denominator") as number;
  const toBarBeat = (beats: number): string =>
    abletonBeatsToBarBeat(beats, numerator, denominator);
  const spans = misses
    .map(({ clipId, clipArrangementStart, clipLength }) =>
      mode.origin === "song"
        ? `${clipId} (${toBarBeat(clipArrangementStart)} to ${toBarBeat(clipArrangementStart + clipLength)})`
        : `${clipId} (1|1 to ${toBarBeat(clipLength)})`,
    )
    .join(", ");

  const where =
    mode.origin === "song"
      ? "Positions are on the song timeline; the clips span"
      : "Positions are relative to each clip's start (1|1), and must be before its end; the clips span";

  console.warn(
    `${mode.param} cut nothing: no split point falls inside any of the clips. ${where} ${spans}.`,
  );
}

interface ExtractMiddleSegmentsArgs {
  track: LiveAPI;
  /** The clip being split, for warnings */
  clipId: string;
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
 *
 * Stopping for the deadline is safe HERE and nowhere later in the segment: the
 * caller places the source copy from this index on, so the part of the clip that
 * never got cut goes back whole instead of vanishing.
 *
 * @param args - Extraction arguments
 * @returns The boundary index the caller should place the tail from
 */
function extractMiddleSegments(args: ExtractMiddleSegmentsArgs): number {
  const {
    track,
    clipId,
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
    if (
      stopForDeadline(
        context.deadline,
        () =>
          `Ran out of time splitting clip ${clipId} after ${i} of ` +
          `${segmentCount - 1} cuts; the rest of it is left whole. ` +
          `Re-run to cut the rest.`,
      )
    ) {
      return i;
    }

    const segStart = boundaries[i] as number; // loop bounds guarantee valid index
    const segEnd = boundaries[i + 1] as number; // loop bounds guarantee valid index

    // Duplicate source to working position
    const workPos = holdingAreaStart + i * (clipLength + 4);
    const workResult = track.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sourceClipId),
      workPos,
    ) as [string, string | number];
    const workClip = LiveAPI.from(workResult);

    // Use exists() rather than `id === "0"`: a non-existent object's id can be
    // "id 0", "0", or 0 (number), so the string-only check missed two of the
    // three failure shapes.
    if (!workClip.exists()) {
      console.warn(
        `Failed to duplicate source for middle segment ${i}, skipping`,
      );
      continue;
    }

    const workClipId = workClip.id;

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

    // Move to final arrangement position. The target sits in the span step 2
    // vacated, and segments are placed left to right at exactly their boundary
    // widths, so nothing can be there — skip the track scan. Both facts depend
    // on every trim above having run; see the validPoints margin.
    moveClipFromHolding(
      workClipId,
      track,
      clipArrangementStart + segStart,
      isMidiClip,
      context,
      true,
    );
  }

  return segmentCount - 1;
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
    const track = LiveAPI.from(livePath.track(range.trackIndex));
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
 * @param splitPoints - Parsed bar|beat positions in beats, read per `mode`
 * @param clips - Array to update with fresh clips after splitting
 * @param _context - Internal context object
 * @param mode - Whether positions are song-timeline or clip-relative
 */
export function performSplitting(
  arrangementClips: LiveAPI[],
  splitPoints: number[],
  clips: LiveAPI[],
  _context: SplittingContext,
  mode: SplitMode,
): void {
  const holdingAreaStart = _context.holdingAreaStartBeats;
  const splitClipRanges = new Map<string, SplitClipRange>();
  const misses: SplitMiss[] = [];

  for (let i = 0; i < arrangementClips.length; i++) {
    // Between clips, so no clip is left half-cut. One clip's own splitting is
    // bounded by MAX_SPLIT_POINTS, and it checks the deadline itself.
    if (
      stopForDeadline(_context.deadline, () => {
        const skipped = arrangementClips.slice(i).map((c) => c.id);

        return (
          `Ran out of time after splitting ${i} of ${arrangementClips.length} clips. ` +
          `Not split: ${skipped.join(", ")}. Re-run for those ids.`
        );
      })
    ) {
      break;
    }

    splitSingleClip({
      clip: arrangementClips[i] as LiveAPI, // bounded by the loop
      splitPoints,
      mode,
      holdingAreaStart,
      context: _context,
      splitClipRanges,
      misses,
    });
  }

  if (splitClipRanges.size === 0 && misses.length > 0) {
    warnNothingSplit(misses, mode);
  }

  rescanSplitClips(splitClipRanges, clips);
}
