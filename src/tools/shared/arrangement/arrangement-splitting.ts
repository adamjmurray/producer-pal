// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { stopForDeadline } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  warnNothingSplit,
  warnUnusedSplitPoints,
  type SplitMiss,
} from "#src/tools/shared/arrangement/arrangement-splitting-warnings.ts";
import {
  createAndDeleteTempClip,
  EPSILON,
  type TilingContext,
} from "#src/tools/shared/arrangement/helpers/arrangement-tiling-helpers.ts";
import {
  holdingAreaStartAfter,
  holdingAreaStartOnTrack,
  moveClipFromHolding,
} from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import {
  rescanSplitClips,
  type SplitClipRange,
} from "./helpers/arrangement-splitting-rescan.ts";

export interface SplittingContext {
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

/** Gap between the work copies a single clip's split stages side by side. */
const WORK_CLIP_GAP_BEATS = 4;

interface SplitSingleClipArgs {
  clip: LiveAPI;
  splitPoints: number[];
  mode: SplitMode;
  context: SplittingContext;
  splitClipRanges: Map<string, SplitClipRange>;
  misses: SplitMiss[];
  /** Indices of the split points that fell inside some clip, filled in here. */
  usedPoints: Set<number>;
  /** What this call has already resolved and staged, per track index. */
  tracks: Map<number, TrackSplitState>;
}

/** One track's share of a split call, reused by every clip cut on it. */
interface TrackSplitState {
  track: LiveAPI;
  /** Where the next clip on this track may stage its work copies. */
  holdingStart: number;
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
 * @returns Whether the clip was measured against the split points. False means
 *   it was skipped before that, so `usedPoints` says nothing about it — see
 *   performSplitting.
 */
function splitSingleClip(args: SplitSingleClipArgs): boolean {
  const { clip, splitPoints, mode, context } = args;
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
  const validPoints: number[] = [];

  for (const [index, p] of offsets.entries()) {
    if (p > EPSILON && p < clipLength - EPSILON) {
      validPoints.push(p);
      args.usedPoints.add(index);
    }
  }

  if (validPoints.length === 0) {
    args.misses.push({ clipId: clip.id, clipArrangementStart, clipLength });

    // Measured, and nothing fell inside — a real answer, not a skip.
    return true;
  }

  const originalClipId = clip.id;
  const { track, holdingStart: holdingAreaStart } = trackStateFor(
    args.tracks,
    trackIndex,
  );

  splitClipRanges.set(originalClipId, {
    trackIndex,
    startTime: clipArrangementStart,
    endTime: clipArrangementEnd,
  });

  // Create boundaries: [0, ...splitPoints, clipLength]
  const boundaries = [0, ...validPoints, clipLength];
  const segmentCount = boundaries.length - 1;
  const tilingCtx = context as TilingContext;

  // Reserve before staging anything, so a throw or a Live refusal below still
  // leaves the next clip clear of whatever this one got as far as writing.
  (args.tracks.get(trackIndex) as TrackSplitState).holdingStart =
    holdingAreaStartAfter(
      holdingAreaStart + segmentCount * (clipLength + WORK_CLIP_GAP_BEATS),
    );

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

    // The split failed, but the points were measured above, so what the caller
    // can say about unused points is unaffected.
    return true;
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
 * The track object and holding-area start to use for a clip on `trackIndex`.
 *
 * Both are resolved once per track per call, not once per clip. The holding
 * area used to be rescanned for every clip — building every clip on the track
 * again — which made cutting one track at many points quadratic. Advancing past
 * what each clip staged (see splitSingleClip) lands at least as far out as a
 * rescan would: every segment goes back inside the clip's own span, so this
 * call's own staging is the only thing that can sit past the track's real
 * clips, including a copy an earlier clip left behind when its split failed.
 *
 * @param tracks - Per-track state for this call, added to on a miss
 * @param trackIndex - The track the clip is on
 * @returns That track's state
 */
function trackStateFor(
  tracks: Map<number, TrackSplitState>,
  trackIndex: number,
): TrackSplitState {
  const known = tracks.get(trackIndex);

  if (known != null) return known;

  const track = LiveAPI.from(livePath.track(trackIndex));
  const state = { track, holdingStart: holdingAreaStartOnTrack(track) };

  tracks.set(trackIndex, state);

  return state;
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
 * never got cut goes back whole instead of vanishing. A Live error mid-segment
 * stops the same way.
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
    const workPos = holdingAreaStart + i * (clipLength + WORK_CLIP_GAP_BEATS);
    let workClipId: string | null = null;

    // Live can refuse any step here. Bail out the same way the deadline does,
    // so the uncut rest of the clip goes back whole instead of the throw
    // escaping and leaving the clip half-cut.
    try {
      // Duplicate source to working position
      const workResult = track.call(
        "duplicate_clip_to_arrangement",
        toLiveApiId(sourceClipId),
        workPos,
      ) as [string, string | number];
      const workClip = LiveAPI.from(workResult);

      // Use exists() rather than `id === "0"`: a non-existent object's id can be
      // "id 0", "0", or 0 (number), so the string-only check missed two of the
      // three failure shapes.
      //
      // Stop here, don't skip ahead: step 2 already trimmed this segment's span
      // off the original, so moving to the next segment leaves it empty and its
      // notes gone. Returning hands the uncut rest back to the caller whole,
      // the same as the deadline and the catch below.
      if (!workClip.exists()) {
        console.warn(
          `Failed to cut segment ${i} of clip ${clipId}: Live refused the ` +
            `duplicate. The rest of the clip is left whole.`,
        );

        return i;
      }

      workClipId = workClip.id;

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
    } catch (error) {
      console.warn(
        `Failed to cut segment ${i} of clip ${clipId}: ${errorMessage(error)}. ` +
          `The rest of the clip is left whole.`,
      );

      // The caller covers this segment's span with the tail, so the half-built
      // work copy is redundant.
      if (workClipId != null) {
        track.call("delete_clip", toLiveApiId(workClipId));
      }

      return i;
    }
  }

  return segmentCount - 1;
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
  const splitClipRanges = new Map<string, SplitClipRange>();
  const misses: SplitMiss[] = [];
  const usedPoints = new Set<number>();
  const tracks = new Map<number, TrackSplitState>();
  // Both warnings below speak for the whole call, and neither holds unless
  // every clip was measured against every position. A deadline stop, a throw,
  // or a skipped clip leaves the count short and usedPoints partial, and the
  // warning would then blame a position that a clip nobody looked at spans.
  let measuredClips = 0;

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

    const clip = arrangementClips[i] as LiveAPI; // bounded by the loop
    const clipId = clip.id;

    try {
      const measured = splitSingleClip({
        clip,
        splitPoints,
        mode,
        context: _context,
        splitClipRanges,
        misses,
        usedPoints,
        tracks,
      });

      if (measured) measuredClips++;
    } catch (error) {
      // Whatever Live refused, the rest of the batch is still worth cutting.
      // This clip is left as it fell; the rescan below reports what survived.
      console.warn(
        `${mode.param} failed for clip ${clipId}: ${errorMessage(error)}. ` +
          `It may be left partly cut, with a copy past the end of the arrangement.`,
      );
    }
  }

  const everyClipMeasured = measuredClips === arrangementClips.length;

  if (splitClipRanges.size === 0) {
    // Nothing cut and nothing skipped, so every clip is a miss — unless there
    // were no clips at all.
    if (everyClipMeasured && misses.length > 0) warnNothingSplit(misses, mode);
  } else if (everyClipMeasured) {
    // Something was cut, so the caller gets a result that looks like it worked.
    // A position that landed in no clip at all has to say so itself.
    warnUnusedSplitPoints(splitPoints, usedPoints, mode);
  }

  rescanSplitClips(splitClipRanges, clips);
}
