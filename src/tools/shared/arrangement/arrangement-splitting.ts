import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { MAX_SPLIT_POINTS } from "#src/tools/constants.ts";
import {
  createUnloopedAudioSegments,
  createUnloopedMidiSegments,
} from "#src/tools/shared/arrangement/arrangement-splitting-helpers.ts";
import {
  createShortenedClipInHolding,
  moveClipFromHolding,
} from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import type { TilingContext } from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { setClipMarkersWithLoopingWorkaround } from "#src/tools/shared/clip-marker-helpers.ts";

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
  warnings: Set<string>;
  context: SplittingContext;
  splitClipRanges: Map<string, SplitClipRange>;
}

/**
 * Split a single clip at the specified points.
 * @param args - Arguments for splitting
 * @returns true if splitting succeeded, false if skipped
 */
function splitSingleClip(args: SplitSingleClipArgs): boolean {
  const { clip, splitPoints, holdingAreaStart, warnings, context } = args;
  const { splitClipRanges } = args;

  const isMidiClip = clip.getProperty("is_midi_clip") === 1;
  const isLooping = (clip.getProperty("looping") as number) > 0;
  const clipArrangementStart = clip.getProperty("start_time") as number;
  const clipArrangementEnd = clip.getProperty("end_time") as number;
  const clipLength = clipArrangementEnd - clipArrangementStart;
  const clipStartMarker = clip.getProperty("start_marker") as number;

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
  const firstSegmentLength = boundaries[1] as number;

  if (isLooping) {
    // CRITICAL: For looped clips, we MUST:
    // 1. Create a source copy in holding area (preserves full clip for all segments)
    // 2. Create segment copies from source copy, each shortened appropriately
    // 3. Delete the original clip
    // 4. Move all segment copies to final arrangement positions
    // 5. Delete the source copy
    //
    // Ableton crashes when duplicate_clip_to_arrangement targets a position
    // where a clip already exists with the same start_time.

    // Step 1: Create source copy at holding area (preserves full original)
    const sourceResult = track.call(
      "duplicate_clip_to_arrangement",
      `id ${originalClipId}`,
      holdingAreaStart,
    ) as [string, string | number];
    const sourceCopy = LiveAPI.from(sourceResult);
    const sourceCopyId = sourceCopy.id;

    // Step 2: Create each segment from source copy
    const holdingClips: Array<{ id: string; position: number }> = [];
    const loopStart = clip.getProperty("loop_start") as number;
    const loopEnd = clip.getProperty("loop_end") as number;
    const loopLength = loopEnd - loopStart;
    // Working area starts just past the source copy
    const workAreaStart = holdingAreaStart + clipLength + 4;

    for (let i = 0; i < boundaries.length - 1; i++) {
      const segmentStart = boundaries[i] as number;
      const segmentEnd = boundaries[i + 1] as number;
      const segmentLength = segmentEnd - segmentStart;
      const segmentPosition = clipArrangementStart + segmentStart;
      // Each segment working position is offset in the work area
      const workPosition = workAreaStart + i * (clipLength + 4);

      const { holdingClipId, holdingClip } = createShortenedClipInHolding(
        sourceCopy,
        track,
        segmentLength,
        workPosition,
        isMidiClip,
        context as TilingContext,
      );

      // Set start_marker to show correct portion of loop content
      if (loopLength > 0 && i > 0) {
        const preRoll = segmentStart % loopLength;

        holdingClip.setProperty("start_marker", loopStart + preRoll);
      }

      holdingClips.push({ id: holdingClipId, position: segmentPosition });
    }

    // Step 3: Delete original clip - BEFORE moving anything to arrangement
    track.call("delete_clip", `id ${originalClipId}`);

    // Step 4: Move all segments from holding to final positions
    for (const { id, position } of holdingClips) {
      moveClipFromHolding(id, track, position);
    }

    // Step 5: Clean up source copy
    track.call("delete_clip", `id ${sourceCopyId}`);
  } else if (isMidiClip) {
    // For unlooped MIDI clips, shorten original in place then create segments
    setClipMarkersWithLoopingWorkaround(clip, {
      startMarker: clipStartMarker,
      endMarker: clipStartMarker + firstSegmentLength,
    });
    createUnloopedMidiSegments(
      clip,
      track,
      boundaries,
      clipArrangementStart,
      clipStartMarker,
      warnings,
    );
  } else {
    // For unlooped audio clips, shorten original in place then create segments
    setClipMarkersWithLoopingWorkaround(clip, {
      startMarker: clipStartMarker,
      endMarker: clipStartMarker + firstSegmentLength,
    });
    createUnloopedAudioSegments(
      clip,
      track,
      boundaries,
      clipArrangementStart,
      clipStartMarker,
      context,
    );
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
 * @param warnings - Set to track warnings already issued
 * @param _context - Internal context object
 */
export function performSplitting(
  arrangementClips: LiveAPI[],
  splitPoints: number[],
  clips: LiveAPI[],
  warnings: Set<string>,
  _context: SplittingContext,
): void {
  const holdingAreaStart = _context.holdingAreaStartBeats;
  const splitClipRanges = new Map<string, SplitClipRange>();

  for (const clip of arrangementClips) {
    splitSingleClip({
      clip,
      splitPoints,
      holdingAreaStart,
      warnings,
      context: _context,
      splitClipRanges,
    });
  }

  rescanSplitClips(splitClipRanges, clips);
}
