import {
  createAudioClipInSession,
  tileClipToRange,
} from "#src/tools/shared/arrangement/arrangement-tiling.js";
import { handleUnloopedLengthening } from "./arrangement-unlooped-helpers.js";

/**
 * @typedef {object} ArrangementContext
 * @property {number} [holdingAreaStartBeats] - Start position of holding area
 * @property {string} [silenceWavPath] - Path to silence WAV file (required for audio clips)
 */

/**
 * @typedef {import("#src/tools/shared/arrangement/arrangement-tiling.js").TilingContext} TilingContext
 */

/**
 * @typedef {object} ClipIdResult
 * @property {string} id - Clip ID
 */

/**
 * Wrapper for tileClipToRange with type casts for ArrangementContext
 * @param {LiveAPI} clip - Source clip
 * @param {LiveAPI} track - Track to tile on
 * @param {number} position - Start position
 * @param {number} length - Length to tile
 * @param {ArrangementContext} ctx - Context with holding area info
 * @param {object} options - Tiling options
 * @returns {Array<ClipIdResult>} Array of tiled clip info
 */
function tileWithContext(clip, track, position, length, ctx, options) {
  return tileClipToRange(
    clip,
    track,
    position,
    length,
    /** @type {number} */ (ctx.holdingAreaStartBeats),
    /** @type {TilingContext} */ (ctx),
    options,
  );
}

/**
 * Handle lengthening of arrangement clips via tiling or content exposure
 * @param {object} options - Parameters object
 * @param {LiveAPI} options.clip - The LiveAPI clip object to lengthen
 * @param {boolean} options.isAudioClip - Whether the clip is an audio clip
 * @param {number} options.arrangementLengthBeats - Target length in beats
 * @param {number} options.currentArrangementLength - Current length in beats
 * @param {number} options.currentStartTime - Current start time in beats
 * @param {number} options.currentEndTime - Current end time in beats
 * @param {ArrangementContext} options.context - Tool execution context with holding area info
 * @returns {Array<ClipIdResult>} - Array of updated clip info
 */
export function handleArrangementLengthening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentStartTime,
  currentEndTime,
  context,
}) {
  /** @type {Array<ClipIdResult>} */
  const updatedClips = [];

  const isLooping = /** @type {number} */ (clip.getProperty("looping")) > 0;
  const clipLoopStart = /** @type {number} */ (clip.getProperty("loop_start"));
  const clipLoopEnd = /** @type {number} */ (clip.getProperty("loop_end"));
  const clipStartMarker = /** @type {number} */ (
    clip.getProperty("start_marker")
  );
  const clipEndMarker = /** @type {number} */ (clip.getProperty("end_marker"));

  // For unlooped clips, use end_marker - start_marker (actual playback length)
  // For looped clips, use loop region
  const clipLength = isLooping
    ? clipLoopEnd - clipLoopStart
    : clipEndMarker - clipStartMarker;

  // Get track for clip operations
  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
    );
  }

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  // Handle unlooped clips separately from looped clips
  if (!isLooping) {
    return handleUnloopedLengthening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentEndTime,
      clipStartMarker,
      track,
      context,
    });
  }

  // Branch: expose hidden content vs tiling (looped clips only)
  if (arrangementLengthBeats < clipLength) {
    // Expose hidden content by tiling with start_marker offsets
    const currentOffset = clipStartMarker - clipLoopStart;
    const remainingLength = arrangementLengthBeats - currentArrangementLength;
    const tiledClips = tileWithContext(
      clip,
      track,
      currentEndTime,
      remainingLength,
      context,
      {
        adjustPreRoll: false,
        startOffset: currentOffset + currentArrangementLength,
        tileLength: currentArrangementLength,
      },
    );

    updatedClips.push({ id: clip.id });
    updatedClips.push(...tiledClips);
  } else {
    // Lengthening via tiling
    const currentOffset = clipStartMarker - clipLoopStart;
    const totalContentLength = clipLoopEnd - clipStartMarker;
    const tiledClips = createLoopeClipTiles({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentStartTime,
      currentEndTime,
      totalContentLength,
      currentOffset,
      track,
      context,
    });

    updatedClips.push({ id: clip.id });
    updatedClips.push(...tiledClips);
  }

  return updatedClips;
}

/**
 * Create tiles for looped clips
 * @param {object} options - Parameters object
 * @param {LiveAPI} options.clip - The LiveAPI clip object
 * @param {boolean} options.isAudioClip - Whether the clip is an audio clip
 * @param {number} options.arrangementLengthBeats - Target length in beats
 * @param {number} options.currentArrangementLength - Current length in beats
 * @param {number} options.currentStartTime - Current start time in beats
 * @param {number} options.currentEndTime - Current end time in beats
 * @param {number} options.totalContentLength - Total content length in beats
 * @param {number} options.currentOffset - Current offset from loop start
 * @param {LiveAPI} options.track - The LiveAPI track object
 * @param {ArrangementContext} options.context - Tool execution context
 * @returns {Array<ClipIdResult>} - Array of tiled clip info
 */
function createLoopeClipTiles({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentStartTime,
  currentEndTime,
  totalContentLength,
  currentOffset,
  track,
  context,
}) {
  /** @type {Array<ClipIdResult>} */
  const updatedClips = [];

  // If clip not showing full content, tile with start_marker offsets
  if (currentArrangementLength < totalContentLength) {
    const remainingLength = arrangementLengthBeats - currentArrangementLength;
    const tiledClips = tileWithContext(
      clip,
      track,
      currentEndTime,
      remainingLength,
      context,
      {
        adjustPreRoll: true,
        startOffset: currentOffset + currentArrangementLength,
        tileLength: currentArrangementLength,
      },
    );

    updatedClips.push(...tiledClips);

    return updatedClips;
  }

  // If current arrangement length > total content length, shorten first then tile
  if (currentArrangementLength > totalContentLength) {
    let newEndTime = currentStartTime + totalContentLength;
    const tempClipLength = currentEndTime - newEndTime;

    // Validation
    if (newEndTime + tempClipLength !== currentEndTime) {
      throw new Error(
        `Shortening validation failed: calculation error in temp clip bounds`,
      );
    }

    // Create temp clip to truncate
    truncateWithTempClip({
      track,
      isAudioClip,
      position: newEndTime,
      length: tempClipLength,
      silenceWavPath: /** @type {string} */ (context.silenceWavPath),
    });

    newEndTime = currentStartTime + totalContentLength;
    const firstTileLength = newEndTime - currentStartTime;
    const remainingSpace = arrangementLengthBeats - firstTileLength;
    const tiledClips = tileWithContext(
      clip,
      track,
      newEndTime,
      remainingSpace,
      context,
      {
        adjustPreRoll: true,
        tileLength: firstTileLength,
      },
    );

    updatedClips.push(...tiledClips);

    return updatedClips;
  }

  // Tile the properly-sized clip
  const firstTileLength = currentEndTime - currentStartTime;
  const remainingSpace = arrangementLengthBeats - firstTileLength;
  const tiledClips = tileWithContext(
    clip,
    track,
    currentEndTime,
    remainingSpace,
    context,
    {
      adjustPreRoll: true,
      tileLength: firstTileLength,
    },
  );

  updatedClips.push(...tiledClips);

  return updatedClips;
}

/**
 * Handle arrangement clip shortening
 * @param {object} options - Parameters object
 * @param {LiveAPI} options.clip - The LiveAPI clip object to shorten
 * @param {boolean} options.isAudioClip - Whether the clip is an audio clip
 * @param {number} options.arrangementLengthBeats - Target length in beats
 * @param {number} options.currentStartTime - Current start time in beats
 * @param {number} options.currentEndTime - Current end time in beats
 * @param {ArrangementContext} options.context - Tool execution context
 */
export function handleArrangementShortening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentStartTime,
  currentEndTime,
  context,
}) {
  const newEndTime = currentStartTime + arrangementLengthBeats;
  const tempClipLength = currentEndTime - newEndTime;

  // Validation
  if (newEndTime + tempClipLength !== currentEndTime) {
    throw new Error(
      `Internal error: temp clip boundary calculation failed for clip ${clip.id}`,
    );
  }

  // Get track
  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(
      `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
    );
  }

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  // Create temporary clip to truncate
  truncateWithTempClip({
    track,
    isAudioClip,
    position: newEndTime,
    length: tempClipLength,
    silenceWavPath: /** @type {string} */ (context.silenceWavPath),
    setupAudioClip: (tempClip) => {
      // Re-apply warping and looping to arrangement clip
      tempClip.set("warping", 1);
      tempClip.set("looping", 1);
      tempClip.set("loop_end", tempClipLength);
    },
  });
}

/**
 * Creates and immediately deletes a temporary clip to truncate arrangement clips
 * @param {object} options - Truncation options
 * @param {LiveAPI} options.track - Track to create temp clip on
 * @param {boolean} options.isAudioClip - Whether to create audio or MIDI clip
 * @param {number} options.position - Position for temp clip
 * @param {number} options.length - Length of temp clip
 * @param {string} options.silenceWavPath - Path to silence WAV (for audio clips)
 * @param {((tempClip: LiveAPI) => void) | null} [options.setupAudioClip] - Optional callback to setup audio temp clip
 */
function truncateWithTempClip({
  track,
  isAudioClip,
  position,
  length,
  silenceWavPath,
  setupAudioClip = null,
}) {
  if (isAudioClip) {
    const { clip: sessionClip, slot } = createAudioClipInSession(
      track,
      length,
      silenceWavPath,
    );
    const tempResult = /** @type {string} */ (
      track.call(
        "duplicate_clip_to_arrangement",
        `id ${sessionClip.id}`,
        position,
      )
    );
    const tempClip = LiveAPI.from(tempResult);

    if (setupAudioClip) {
      setupAudioClip(tempClip);
    }

    slot.call("delete_clip");
    track.call("delete_clip", `id ${tempClip.id}`);
  } else {
    const tempClipResult = /** @type {string} */ (
      track.call("create_midi_clip", position, length)
    );
    const tempClip = LiveAPI.from(tempClipResult);

    track.call("delete_clip", `id ${tempClip.id}`);
  }
}
