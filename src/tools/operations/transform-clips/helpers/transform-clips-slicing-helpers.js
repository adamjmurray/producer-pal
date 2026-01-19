import { barBeatDurationToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.js";
import * as console from "#src/shared/v8-max-console.js";
import { revealAudioContentAtPosition } from "#src/tools/clip/update/helpers/update-clip-audio-helpers.js";
import { MAX_SLICES } from "#src/tools/constants.js";
import {
  createShortenedClipInHolding,
  moveClipFromHolding,
  tileClipToRange,
} from "#src/tools/shared/arrangement/arrangement-tiling.js";
import { setClipMarkersWithLoopingWorkaround } from "#src/tools/shared/clip-marker-helpers.js";

/**
 * @typedef {object} SlicingContext
 * @property {number} holdingAreaStartBeats - Start position for holding area
 * @property {string} [silenceWavPath] - Path to silence WAV file for audio clip operations
 */

/**
 * Iterate through slice positions and call handler for each
 * @param {LiveAPI} sourceClip - The source clip to slice
 * @param {number} sliceBeats - Slice duration in beats
 * @param {number} currentStartTime - Start time of the original clip
 * @param {number} currentEndTime - End time of the original clip
 * @param {(sliceContentStart: number, sliceContentEnd: number, slicePosition: number) => void} sliceHandler - Handler called for each slice position
 */
function iterateSlicePositions(
  sourceClip,
  sliceBeats,
  currentStartTime,
  currentEndTime,
  sliceHandler,
) {
  const clipStartMarker = /** @type {number} */ (
    sourceClip.getProperty("start_marker")
  );
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
 * Any slices beyond actual note content will simply be empty.
 * @param {LiveAPI} sourceClip - The source clip to duplicate from
 * @param {LiveAPI} track - The track containing the clip
 * @param {number} sliceBeats - Slice duration in beats
 * @param {number} currentStartTime - Start time of the original clip
 * @param {number} currentEndTime - End time of the original clip
 */
function sliceUnloopedMidiContent(
  sourceClip,
  track,
  sliceBeats,
  currentStartTime,
  currentEndTime,
) {
  iterateSlicePositions(
    sourceClip,
    sliceBeats,
    currentStartTime,
    currentEndTime,
    (sliceContentStart, sliceContentEnd, slicePosition) => {
      const duplicateResult = /** @type {string} */ (
        track.call(
          "duplicate_clip_to_arrangement",
          `id ${sourceClip.id}`,
          slicePosition,
        )
      );
      const sliceClip = LiveAPI.from(duplicateResult);

      setClipMarkersWithLoopingWorkaround(sliceClip, {
        startMarker: sliceContentStart,
        endMarker: sliceContentEnd,
      });
    },
  );
}

/**
 * Reveal hidden content in unlooped audio clips by duplicating and setting markers
 * @param {LiveAPI} sourceClip - The source clip to duplicate from
 * @param {LiveAPI} track - The track containing the clip
 * @param {number} sliceBeats - Slice duration in beats
 * @param {number} currentStartTime - Start time of the original clip
 * @param {number} currentEndTime - End time of the original clip
 * @param {SlicingContext} _context - Internal context object
 */
function sliceUnloopedAudioContent(
  sourceClip,
  track,
  sliceBeats,
  currentStartTime,
  currentEndTime,
  _context,
) {
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
 * @param {string | undefined} slice - Slice duration in bar:beat format
 * @param {Array<LiveAPI>} arrangementClips - Array of arrangement clips
 * @param {Set<string>} warnings - Set to track warnings already issued
 * @returns {number|null} - Slice duration in beats or null
 */
export function prepareSliceParams(slice, arrangementClips, warnings) {
  if (slice == null) {
    return null;
  }

  if (arrangementClips.length === 0) {
    if (!warnings.has("slice-no-arrangement")) {
      console.error("Warning: slice requires arrangement clips");
      warnings.add("slice-no-arrangement");
    }

    return null;
  }

  const liveSet = LiveAPI.from("live_set");
  const songTimeSigNumerator = /** @type {number} */ (
    liveSet.getProperty("signature_numerator")
  );
  const songTimeSigDenominator = /** @type {number} */ (
    liveSet.getProperty("signature_denominator")
  );
  const sliceBeats = barBeatDurationToAbletonBeats(
    slice,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  if (sliceBeats <= 0) {
    throw new Error("slice must be greater than 0");
  }

  return sliceBeats;
}

/**
 * Perform slicing of arrangement clips
 * @param {Array<LiveAPI>} arrangementClips - Array of arrangement clips to slice
 * @param {number} sliceBeats - Slice duration in Ableton beats
 * @param {Array<LiveAPI>} clips - Array to update with fresh clips after slicing
 * @param {Set<string>} _warnings - Set to track warnings (unused, kept for consistent signature)
 * @param {string} slice - Original slice parameter for error messages
 * @param {SlicingContext} _context - Internal context object
 */
export function performSlicing(
  arrangementClips,
  sliceBeats,
  clips,
  _warnings,
  slice,
  _context,
) {
  const holdingAreaStart = _context.holdingAreaStartBeats;
  let totalSlicesCreated = 0;
  // Track position ranges for sliced clips to re-scan after deletion
  const slicedClipRanges = new Map();

  for (const clip of arrangementClips) {
    const isMidiClip = clip.getProperty("is_midi_clip") === 1;
    const isLooping = /** @type {number} */ (clip.getProperty("looping")) > 0;
    // Get current clip arrangement length
    const currentStartTime = /** @type {number} */ (
      clip.getProperty("start_time")
    );
    const currentEndTime = /** @type {number} */ (clip.getProperty("end_time"));
    const currentArrangementLength = currentEndTime - currentStartTime;

    // Only slice if clip is longer than or equal to slice size
    if (currentArrangementLength < sliceBeats) {
      continue; // Skip clips smaller than slice size
    }

    // Check if adding this clip's slices would exceed the limit
    const sliceCount = Math.ceil(currentArrangementLength / sliceBeats);

    if (totalSlicesCreated + sliceCount > MAX_SLICES) {
      throw new Error(
        `Slicing at ${slice} would create ${sliceCount} slices for a ${currentArrangementLength}-beat clip. ` +
          `Maximum ${MAX_SLICES} slices total. Use a longer slice duration.`,
      );
    }

    // Get track for this clip
    // Store trackIndex BEFORE any operations to prevent staleness
    const trackIndex = clip.trackIndex;

    if (trackIndex == null) {
      throw new Error(
        `transformClips failed: could not determine trackIndex for clip ${clip.id}`,
      );
    }

    const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
    // Store position info before slicing (for re-scanning after deletion)
    const originalClipId = clip.id;

    slicedClipRanges.set(originalClipId, {
      trackIndex,
      startTime: currentStartTime,
      endTime: currentEndTime,
    });
    // Shorten clip at original position using holding area technique
    const { holdingClipId } = createShortenedClipInHolding(
      clip,
      track,
      sliceBeats,
      holdingAreaStart,
      isMidiClip,
      /** @type {import("#src/tools/shared/arrangement/arrangement-tiling.js").TilingContext} */ (
        _context
      ),
    );

    // Delete original clip before moving from holding
    track.call("delete_clip", `id ${originalClipId}`);
    // Move shortened clip from holding back to original position
    const movedClip = moveClipFromHolding(
      holdingClipId,
      track,
      currentStartTime,
    );
    // Fill remaining space after the first slice
    const remainingLength = currentArrangementLength - sliceBeats;

    if (remainingLength > 0) {
      if (isLooping) {
        // Looped clips: tile to fill with repeated content
        tileClipToRange(
          movedClip,
          track,
          currentStartTime + sliceBeats,
          remainingLength,
          holdingAreaStart,
          /** @type {import("#src/tools/shared/arrangement/arrangement-tiling.js").TilingContext} */ (
            _context
          ),
          { adjustPreRoll: true, tileLength: sliceBeats },
        );
      } else if (isMidiClip) {
        // Unlooped MIDI clips: reveal hidden content for each slice position
        sliceUnloopedMidiContent(
          movedClip,
          track,
          sliceBeats,
          currentStartTime,
          currentEndTime,
        );
      } else {
        // Unlooped audio clips: reveal hidden content for each slice position
        sliceUnloopedAudioContent(
          movedClip,
          track,
          sliceBeats,
          currentStartTime,
          currentEndTime,
          _context,
        );
      }
    }

    // Track total slices created
    totalSlicesCreated += sliceCount;
  }

  // Re-scan tracks to replace stale clip objects with fresh ones
  for (const [oldClipId, range] of slicedClipRanges) {
    const track = LiveAPI.from(`live_set tracks ${range.trackIndex}`);
    const trackClipIds = track.getChildIds("arrangement_clips");
    // Find all clips in the original clip's position range (with small epsilon for floating-point)
    const EPSILON = 0.001;
    const freshClips = trackClipIds
      .map((id) => LiveAPI.from(id))
      .filter((c) => {
        const clipStart = /** @type {number} */ (c.getProperty("start_time"));

        return (
          clipStart >= range.startTime - EPSILON &&
          clipStart < range.endTime - EPSILON
        );
      });
    // Replace stale clip in clips array with fresh clips
    const staleIndex = clips.findIndex((c) => c.id === oldClipId);

    if (staleIndex !== -1) {
      clips.splice(staleIndex, 1, ...freshClips);
    }
  }
}
