// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { isDeadlineExceeded } from "#src/shared/max/v8-request-deadline.ts";
import {
  warnNothingSplit,
  warnUnusedSplitPoints,
  type SplitMiss,
} from "#src/tools/shared/arrangement/arrangement-splitting-warnings.ts";
import { clipFromDuplicateResult } from "#src/tools/shared/arrangement/helpers/arrangement-duplicate-result.ts";
import {
  type LaneView,
  laneViewOf,
} from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { type ClipReporter } from "#src/tools/shared/arrangement/helpers/clip-reporter.ts";
import {
  createAndDeleteTempClip,
  EPSILON,
  type TilingContext,
} from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import {
  holdingAreaStartAfter,
  holdingAreaStartOnTrack,
  moveClipFromHolding,
} from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import {
  rescanSplitClips,
  splitOffsetsInside,
  type SplitClipRange,
} from "./arrangement-splitting-rescan.ts";
import { ignoredText } from "#src/shared/max/ignored-wording.ts";

export interface SplittingContext {
  silenceWavPath?: string;
  /** When the request's budget runs out; set once per request by the adapter. */
  deadline?: number | null;
  /** Where to say what happened to a clip; unset drops what the split reports. */
  reportClip?: ClipReporter;
  /** What is on the arrangement lanes, shared with every write in the call. */
  lanes?: LaneView;
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
  const { reportClip } = context;
  const { splitClipRanges } = args;

  const isMidiClip = clip.getProperty("is_midi_clip") === 1;
  const clipArrangementStart = clip.getProperty("start_time") as number;
  const clipArrangementEnd = clip.getProperty("end_time") as number;
  const clipLength = clipArrangementEnd - clipArrangementStart;

  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    reportClip?.refuse(
      clip.id,
      ignoredText(mode.param, "could not find the clip's track"),
    );

    return false;
  }

  const validPoints: number[] = [];

  for (const { index, offset } of splitOffsetsInside(
    splitPoints,
    mode,
    clipArrangementStart,
    clipLength,
  )) {
    validPoints.push(offset);
    args.usedPoints.add(index);
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
    context,
  );

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
  const sourceClip = clipFromDuplicateResult(
    track.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(originalClipId),
      sourcePos,
    ),
  );

  if (!sourceClip.exists()) {
    reportClip?.refuse(
      originalClipId,
      ignoredText(mode.param, "Live refused the copy the cut works from"),
    );

    // The split failed, but the points were measured above, so what the caller
    // can say about unused points is unaffected.
    return true;
  }

  // Registered only now that a cut is really going to happen: a clip in here is
  // one the rescan hands back as pieces, which the caller reads as work that
  // landed. An uncut clip must stay out or its refusal reads as a success.
  splitClipRanges.set(originalClipId, {
    trackIndex,
    startTime: clipArrangementStart,
    endTime: clipArrangementEnd,
  });

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
    mode,
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
 * @param context - The call's context, which carries its lane view
 * @returns That track's state
 */
function trackStateFor(
  tracks: Map<number, TrackSplitState>,
  trackIndex: number,
  context: SplittingContext,
): TrackSplitState {
  const known = tracks.get(trackIndex);

  if (known != null) {
    return known;
  }

  const track = LiveAPI.from(livePath.track(trackIndex));
  const state = {
    track,
    holdingStart: holdingAreaStartOnTrack(track, 0, context),
  };

  tracks.set(trackIndex, state);

  return state;
}

interface ExtractMiddleSegmentsArgs {
  track: LiveAPI;
  /** The clip being split, for its entry's reason */
  clipId: string;
  /** The param the caller used, for that reason's wording */
  mode: SplitMode;
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
    mode,
    sourceClipId,
    boundaries,
    segmentCount,
    clipArrangementStart,
    clipLength,
    holdingAreaStart,
    isMidiClip,
    context,
  } = args;
  const cutsMade = (reached: number): string =>
    `${mode.param} made ${reached} of ${segmentCount - 1} cuts`;

  for (let i = 1; i < segmentCount - 1; i++) {
    // Checked, not warned: this is about the one clip being cut, so it goes on
    // that clip's entry like the refusals below.
    if (isDeadlineExceeded(context.deadline ?? null)) {
      context.reportClip?.note(
        clipId,
        `${cutsMade(i)}: ran out of time, so the rest of the clip is left ` +
          `whole; re-run to cut the rest`,
      );

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
      const workClip = clipFromDuplicateResult(
        track.call(
          "duplicate_clip_to_arrangement",
          toLiveApiId(sourceClipId),
          workPos,
        ),
      );

      // Check exists(), not `id === "0"`: a nonexistent object's id can be
      // "id 0", "0", or 0.
      //
      // Stop here, don't skip ahead: step 2 already trimmed this segment's span
      // off the original, so moving to the next segment leaves it empty and its
      // notes gone. Returning hands the uncut rest back to the caller whole,
      // the same as the deadline and the catch below.
      if (!workClip.exists()) {
        context.reportClip?.note(
          clipId,
          `${cutsMade(i)}: Live refused a copy, so the rest of the clip is left whole`,
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
      context.reportClip?.note(
        clipId,
        `${cutsMade(i)}: ${errorMessage(error)}; the rest of the clip is left whole`,
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

/** One call's cuts, a clip at a time, and what the cuts add up to. */
export interface SplitRun {
  /** Where each cut clip sat before it was cut, by the id it was cut at */
  ranges: Map<string, SplitClipRange>;
  /**
   * Cut one clip at the call's positions. A clip left whole says why on its
   * own entry; one cut leaves its range in `ranges`.
   * @param clip - The arrangement clip to cut
   */
  cut: (clip: LiveAPI) => void;
  /**
   * The pieces a clip became once it was cut, found on its lane.
   * @param clip - The clip that was cut
   * @returns The pieces, in lane order; empty when the clip was not cut
   */
  piecesOf: (clip: LiveAPI) => LiveAPI[];
  /**
   * Say what the whole call cut nothing of. Only holds when every clip was
   * measured, so a deadline stop or a skipped clip says nothing.
   * @param clipCount - How many clips the call set out to cut
   */
  finish: (clipCount: number) => void;
}

/**
 * Begin cutting clips at specified positions, one clip at a time.
 *
 * Uses partial-success model: a clip that fails to split is skipped, and says
 * so on its own result entry.
 *
 * @param splitPoints - Parsed bar|beat positions in beats, read per `mode`
 * @param context - Internal context object
 * @param mode - Whether positions are song-timeline or clip-relative
 * @returns The run to cut clips with
 */
export function startSplitting(
  splitPoints: number[],
  context: SplittingContext,
  mode: SplitMode,
): SplitRun {
  const ranges = new Map<string, SplitClipRange>();
  const misses: SplitMiss[] = [];
  const usedPoints = new Set<number>();
  const tracks = new Map<number, TrackSplitState>();
  // Both warnings speak for the whole call, and neither holds unless every clip
  // was measured against every position. A deadline stop, a throw, or a skipped
  // clip leaves the count short and usedPoints partial, and the warning would
  // then blame a position that a clip nobody looked at spans.
  let measuredClips = 0;

  return {
    ranges,
    piecesOf: (clip) => {
      const range = ranges.get(clip.id);

      return range == null
        ? []
        : (rescanSplitClips(
            new Map([[clip.id, range]]),
            [],
            laneViewOf(context),
            (trackIndex) => tracks.get(trackIndex)?.track,
          ).get(clip.id) ?? []);
    },
    cut: (clip) => {
      const clipId = clip.id;

      try {
        const measured = splitSingleClip({
          clip,
          splitPoints,
          mode,
          context,
          splitClipRanges: ranges,
          misses,
          usedPoints,
          tracks,
        });

        if (measured) {
          measuredClips++;
        }
      } catch (error) {
        // Whatever Live refused, the rest of the batch is still worth cutting.
        // This clip is left as it fell; the rescan reports what survived.
        context.reportClip?.note(
          clipId,
          `${mode.param} failed: ${errorMessage(error)}; the clip may be left ` +
            `partly cut, with a copy past the end of the arrangement`,
        );
      }
    },
    finish: (clipCount) => {
      if (measuredClips !== clipCount) {
        return;
      }

      // Nothing cut and nothing skipped, so every clip is a miss — unless there
      // were no clips at all.
      if (ranges.size === 0) {
        if (misses.length > 0) {
          warnNothingSplit(misses, mode);
        }
      } else {
        // Something was cut, so the caller gets a result that looks like it
        // worked. A position that landed in no clip at all has to say so itself.
        warnUnusedSplitPoints(splitPoints, usedPoints, mode);
      }
    },
  };
}

/**
 * Perform splitting of arrangement clips at specified positions.
 *
 * @param arrangementClips - Array of arrangement clips to split
 * @param splitPoints - Parsed bar|beat positions in beats, read per `mode`
 * @param clips - Array to update with fresh clips after splitting
 * @param _context - Internal context object
 * @param mode - Whether positions are song-timeline or clip-relative
 * @returns The pieces each cut clip became, by the id it was cut at
 */
export function performSplitting(
  arrangementClips: LiveAPI[],
  splitPoints: number[],
  clips: LiveAPI[],
  _context: SplittingContext,
  mode: SplitMode,
): Map<string, LiveAPI[]> {
  const run = startSplitting(splitPoints, _context, mode);

  for (const clip of arrangementClips) {
    // Between clips, so no clip is left half-cut. One clip's own splitting is
    // bounded by MAX_SPLIT_POINTS, and it checks the deadline itself. The clips
    // left stay unsplit, and update-clip's own deadline check gives each its
    // entry.
    if (isDeadlineExceeded(_context.deadline ?? null)) {
      break;
    }

    run.cut(clip);
  }

  run.finish(arrangementClips.length);

  return rescanSplitClips(run.ranges, clips, laneViewOf(_context));
}
