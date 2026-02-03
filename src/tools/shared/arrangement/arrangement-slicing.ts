import { barBeatDurationToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { MAX_SLICES } from "#src/tools/constants.ts";
import { revealAudioContentAtPosition } from "#src/tools/shared/arrangement/arrangement-audio-helpers.ts";
import {
  createShortenedClipInHolding,
  moveClipFromHolding,
  tileClipToRange,
} from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import type { TilingContext } from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { setClipMarkersWithLoopingWorkaround } from "#src/tools/shared/clip-marker-helpers.ts";

export interface SlicingContext {
  holdingAreaStartBeats: number;
  silenceWavPath?: string;
}

interface SlicedClipRange {
  trackIndex: number;
  startTime: number;
  endTime: number;
}

/**
 * Iterate through slice positions and call handler for each
 * @param sourceClip - The source clip to slice
 * @param sliceBeats - Slice duration in beats
 * @param currentStartTime - Start time of the original clip
 * @param currentEndTime - End time of the original clip
 * @param sliceHandler - Handler called for each slice position
 */
function iterateSlicePositions(
  sourceClip: LiveAPI,
  sliceBeats: number,
  currentStartTime: number,
  currentEndTime: number,
  sliceHandler: (
    sliceContentStart: number,
    sliceContentEnd: number,
    slicePosition: number,
  ) => void,
): void {
  const clipStartMarker = sourceClip.getProperty("start_marker") as number;
  let currentSlicePosition = currentStartTime + sliceBeats;
  let currentContentOffset = sliceBeats;

  while (currentSlicePosition < currentEndTime - 0.001) {
    const sliceLengthNeeded = Math.min(
      sliceBeats,
      currentEndTime - currentSlicePosition,
    );
    const sliceContentStart = clipStartMarker + currentContentOffset;
    const sliceContentEnd = sliceContentStart + sliceLengthNeeded;

    sliceHandler(sliceContentStart, sliceContentEnd, currentSlicePosition);

    currentSlicePosition += sliceBeats;
    currentContentOffset += sliceBeats;
  }
}

/**
 * Slice unlooped MIDI clips by duplicating and setting markers for each slice.
 * @param sourceClip - The source clip to duplicate from
 * @param track - The track containing the clip
 * @param sliceBeats - Slice duration in beats
 * @param currentStartTime - Start time of the original clip
 * @param currentEndTime - End time of the original clip
 * @param warnings - Set to track warnings already issued
 */
function sliceUnloopedMidiContent(
  sourceClip: LiveAPI,
  track: LiveAPI,
  sliceBeats: number,
  currentStartTime: number,
  currentEndTime: number,
  warnings: Set<string>,
): void {
  iterateSlicePositions(
    sourceClip,
    sliceBeats,
    currentStartTime,
    currentEndTime,
    (sliceContentStart, sliceContentEnd, slicePosition) => {
      const duplicateResult = track.call(
        "duplicate_clip_to_arrangement",
        sourceClip.id,
        slicePosition,
      ) as string;
      const sliceClip = LiveAPI.from(duplicateResult);

      if (!sliceClip.exists()) {
        if (!warnings.has("slice-duplicate-failed")) {
          console.warn(
            `Failed to duplicate clip for MIDI slice at ${slicePosition}, some slices may be missing`,
          );
          warnings.add("slice-duplicate-failed");
        }

        return;
      }

      setClipMarkersWithLoopingWorkaround(sliceClip, {
        startMarker: sliceContentStart,
        endMarker: sliceContentEnd,
      });
    },
  );
}

/**
 * Reveal hidden content in unlooped audio clips by duplicating and setting markers
 * @param sourceClip - The source clip to duplicate from
 * @param track - The track containing the clip
 * @param sliceBeats - Slice duration in beats
 * @param currentStartTime - Start time of the original clip
 * @param currentEndTime - End time of the original clip
 * @param _context - Internal context object
 */
function sliceUnloopedAudioContent(
  sourceClip: LiveAPI,
  track: LiveAPI,
  sliceBeats: number,
  currentStartTime: number,
  currentEndTime: number,
  _context: SlicingContext,
): void {
  iterateSlicePositions(
    sourceClip,
    sliceBeats,
    currentStartTime,
    currentEndTime,
    (sliceContentStart, sliceContentEnd, slicePosition) => {
      revealAudioContentAtPosition(
        sourceClip,
        track,
        sliceContentStart,
        sliceContentEnd,
        slicePosition,
        _context,
      );
    },
  );
}

/**
 * Prepare slice parameters by converting to Ableton beats
 * @param slice - Slice duration in bar:beat format
 * @param arrangementClips - Array of arrangement clips
 * @param warnings - Set to track warnings already issued
 * @returns Slice duration in beats or null
 */
export function prepareSliceParams(
  slice: string | undefined,
  arrangementClips: LiveAPI[],
  warnings: Set<string>,
): number | null {
  if (slice == null) {
    return null;
  }

  if (arrangementClips.length === 0) {
    if (!warnings.has("slice-no-arrangement")) {
      console.warn("slice requires arrangement clips");
      warnings.add("slice-no-arrangement");
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
  const sliceBeats = barBeatDurationToAbletonBeats(
    slice,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  if (sliceBeats <= 0) {
    if (!warnings.has("slice-invalid-size")) {
      console.warn("slice must be greater than 0, skipping");
      warnings.add("slice-invalid-size");
    }

    return null;
  }

  return sliceBeats;
}

interface SliceSingleClipArgs {
  clip: LiveAPI;
  sliceBeats: number;
  holdingAreaStart: number;
  warnings: Set<string>;
  context: SlicingContext;
  slicedClipRanges: Map<string, SlicedClipRange>;
}

/**
 * Slice a single clip into segments
 * @param args - Arguments for slicing
 * @returns true if slicing succeeded, false if skipped
 */
function sliceSingleClip(args: SliceSingleClipArgs): boolean {
  const { clip, sliceBeats, holdingAreaStart, warnings, context } = args;
  const { slicedClipRanges } = args;

  const isMidiClip = clip.getProperty("is_midi_clip") === 1;
  const isLooping = (clip.getProperty("looping") as number) > 0;
  const currentStartTime = clip.getProperty("start_time") as number;
  const currentEndTime = clip.getProperty("end_time") as number;

  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    console.warn(
      `Could not determine trackIndex for clip ${clip.id}, skipping`,
    );

    return false;
  }

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
  const originalClipId = clip.id;

  slicedClipRanges.set(originalClipId, {
    trackIndex,
    startTime: currentStartTime,
    endTime: currentEndTime,
  });

  const { holdingClipId } = createShortenedClipInHolding(
    clip,
    track,
    sliceBeats,
    holdingAreaStart,
    isMidiClip,
    context as TilingContext,
  );

  const holdingClip = LiveAPI.from(holdingClipId);

  if (!holdingClip.exists()) {
    if (!warnings.has("slice-holding-failed")) {
      console.warn(
        `Failed to create holding clip for ${originalClipId}, skipping slicing`,
      );
      warnings.add("slice-holding-failed");
    }

    slicedClipRanges.delete(originalClipId);

    return false;
  }

  track.call("delete_clip", originalClipId);

  const movedClip = moveClipFromHolding(holdingClipId, track, currentStartTime);
  const currentArrangementLength = currentEndTime - currentStartTime;
  const remainingLength = currentArrangementLength - sliceBeats;

  if (remainingLength > 0) {
    fillRemainingSlices(
      movedClip,
      track,
      isLooping,
      isMidiClip,
      sliceBeats,
      currentStartTime,
      currentEndTime,
      holdingAreaStart,
      remainingLength,
      warnings,
      context,
    );
  }

  return true;
}

/**
 * Fill remaining space with sliced content
 * @param movedClip - The clip that was moved from holding
 * @param track - The track containing the clip
 * @param isLooping - Whether the clip is looping
 * @param isMidiClip - Whether the clip is a MIDI clip
 * @param sliceBeats - Slice duration in beats
 * @param currentStartTime - Start time of the original clip
 * @param currentEndTime - End time of the original clip
 * @param holdingAreaStart - Start of the holding area
 * @param remainingLength - Remaining length to fill
 * @param warnings - Set to track warnings
 * @param context - Slicing context
 */
function fillRemainingSlices(
  movedClip: LiveAPI,
  track: LiveAPI,
  isLooping: boolean,
  isMidiClip: boolean,
  sliceBeats: number,
  currentStartTime: number,
  currentEndTime: number,
  holdingAreaStart: number,
  remainingLength: number,
  warnings: Set<string>,
  context: SlicingContext,
): void {
  if (isLooping) {
    tileClipToRange(
      movedClip,
      track,
      currentStartTime + sliceBeats,
      remainingLength,
      holdingAreaStart,
      context as TilingContext,
      { adjustPreRoll: true, tileLength: sliceBeats },
    );
  } else if (isMidiClip) {
    sliceUnloopedMidiContent(
      movedClip,
      track,
      sliceBeats,
      currentStartTime,
      currentEndTime,
      warnings,
    );
  } else {
    sliceUnloopedAudioContent(
      movedClip,
      track,
      sliceBeats,
      currentStartTime,
      currentEndTime,
      context,
    );
  }
}

/**
 * Re-scan tracks to replace stale clip objects with fresh ones
 * @param slicedClipRanges - Map of original clip IDs to their ranges
 * @param clips - Array to update with fresh clips
 */
function rescanSlicedClips(
  slicedClipRanges: Map<string, SlicedClipRange>,
  clips: LiveAPI[],
): void {
  const EPSILON = 0.001;

  for (const [oldClipId, range] of slicedClipRanges) {
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
 * Perform slicing of arrangement clips.
 *
 * Uses partial-success model: if a clip fails to slice, it is skipped and a
 * warning is emitted. This is consistent with update-clip error handling patterns.
 *
 * @param arrangementClips - Array of arrangement clips to slice
 * @param sliceBeats - Slice duration in Ableton beats
 * @param clips - Array to update with fresh clips after slicing
 * @param warnings - Set to track warnings already issued
 * @param slice - Original slice parameter for error messages
 * @param _context - Internal context object
 */
export function performSlicing(
  arrangementClips: LiveAPI[],
  sliceBeats: number,
  clips: LiveAPI[],
  warnings: Set<string>,
  slice: string,
  _context: SlicingContext,
): void {
  const holdingAreaStart = _context.holdingAreaStartBeats;
  let totalSlicesCreated = 0;
  const slicedClipRanges = new Map<string, SlicedClipRange>();

  for (const clip of arrangementClips) {
    const currentStartTime = clip.getProperty("start_time") as number;
    const currentEndTime = clip.getProperty("end_time") as number;
    const currentArrangementLength = currentEndTime - currentStartTime;

    if (currentArrangementLength < sliceBeats) {
      continue;
    }

    const sliceCount = Math.ceil(currentArrangementLength / sliceBeats);

    if (totalSlicesCreated + sliceCount > MAX_SLICES) {
      if (!warnings.has("slice-max-exceeded")) {
        console.warn(
          `Slicing at ${slice} would create ${sliceCount} slices for a ${currentArrangementLength}-beat clip, ` +
            `exceeding max ${MAX_SLICES}. Skipping remaining clips.`,
        );
        warnings.add("slice-max-exceeded");
      }

      continue;
    }

    const success = sliceSingleClip({
      clip,
      sliceBeats,
      holdingAreaStart,
      warnings,
      context: _context,
      slicedClipRanges,
    });

    if (success) {
      totalSlicesCreated += sliceCount;
    }
  }

  rescanSlicedClips(slicedClipRanges, clips);
}
