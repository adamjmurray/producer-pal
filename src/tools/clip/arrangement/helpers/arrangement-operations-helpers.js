import {
  createAudioClipInSession,
  tileClipToRange,
} from "#src/tools/shared/arrangement/arrangement-tiling.js";
import { handleUnloopedLengthening } from "./arrangement-unlooped-helpers.js";

/**
 * Handle lengthening of arrangement clips via tiling or content exposure
 * @param {object} root0 - Parameters object
 * @param {object} root0.clip - The LiveAPI clip object to lengthen
 * @param {boolean} root0.isAudioClip - Whether the clip is an audio clip
 * @param {number} root0.arrangementLengthBeats - Target length in beats
 * @param {number} root0.currentArrangementLength - Current length in beats
 * @param {number} root0.currentStartTime - Current start time in beats
 * @param {number} root0.currentEndTime - Current end time in beats
 * @param {object} root0.context - Tool execution context with holding area info
 * @returns {Array<object>} - Array of updated clip info
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
  const updatedClips = [];

  const isLooping = clip.getProperty("looping") > 0;
  const clipLoopStart = clip.getProperty("loop_start");
  const clipLoopEnd = clip.getProperty("loop_end");
  const clipStartMarker = clip.getProperty("start_marker");
  const clipEndMarker = clip.getProperty("end_marker");

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

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  // Handle unlooped clips separately from looped clips
  if (!isLooping) {
    return handleUnloopedLengthening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentStartTime,
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
    const tiledClips = tileClipToRange(
      clip,
      track,
      currentEndTime,
      remainingLength,
      context.holdingAreaStartBeats,
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
      clipLoopStart,
      clipLoopEnd,
      clipStartMarker,
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
 * @param {object} root0 - Parameters object
 * @param {object} root0.clip - The LiveAPI clip object
 * @param {boolean} root0.isAudioClip - Whether the clip is an audio clip
 * @param {number} root0.arrangementLengthBeats - Target length in beats
 * @param {number} root0.currentArrangementLength - Current length in beats
 * @param {number} root0.currentStartTime - Current start time in beats
 * @param {number} root0.currentEndTime - Current end time in beats
 * @param {number} root0._clipLoopStart - Clip loop start position (unused)
 * @param {number} root0._clipLoopEnd - Clip loop end position (unused)
 * @param {number} root0._clipStartMarker - Clip start marker (unused)
 * @param {number} root0.totalContentLength - Total content length in beats
 * @param {number} root0.currentOffset - Current offset from loop start
 * @param {object} root0.track - The LiveAPI track object
 * @param {object} root0.context - Tool execution context
 * @returns {Array<object>} - Array of tiled clip info
 */
function createLoopeClipTiles({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentStartTime,
  currentEndTime,
  _clipLoopStart,
  _clipLoopEnd,
  _clipStartMarker,
  totalContentLength,
  currentOffset,
  track,
  context,
}) {
  const updatedClips = [];

  // If clip not showing full content, tile with start_marker offsets
  if (currentArrangementLength < totalContentLength) {
    const remainingLength = arrangementLengthBeats - currentArrangementLength;
    const tiledClips = tileClipToRange(
      clip,
      track,
      currentEndTime,
      remainingLength,
      context.holdingAreaStartBeats,
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
    if (isAudioClip) {
      const { clip: sessionClip, slot } = createAudioClipInSession(
        track,
        tempClipLength,
        context.silenceWavPath,
      );
      const tempResult = track.call(
        "duplicate_clip_to_arrangement",
        `id ${sessionClip.id}`,
        newEndTime,
      );
      const tempClip = LiveAPI.from(tempResult);
      slot.call("delete_clip");
      track.call("delete_clip", `id ${tempClip.id}`);
    } else {
      const tempClipPath = track.call(
        "create_midi_clip",
        newEndTime,
        tempClipLength,
      );
      const tempClip = LiveAPI.from(tempClipPath);
      track.call("delete_clip", `id ${tempClip.id}`);
    }

    newEndTime = currentStartTime + totalContentLength;
    const firstTileLength = newEndTime - currentStartTime;
    const remainingSpace = arrangementLengthBeats - firstTileLength;
    const tiledClips = tileClipToRange(
      clip,
      track,
      newEndTime,
      remainingSpace,
      context.holdingAreaStartBeats,
      context,
      { adjustPreRoll: true, tileLength: firstTileLength },
    );
    updatedClips.push(...tiledClips);
    return updatedClips;
  }

  // Tile the properly-sized clip
  const firstTileLength = currentEndTime - currentStartTime;
  const remainingSpace = arrangementLengthBeats - firstTileLength;
  const tiledClips = tileClipToRange(
    clip,
    track,
    currentEndTime,
    remainingSpace,
    context.holdingAreaStartBeats,
    context,
    { adjustPreRoll: true, tileLength: firstTileLength },
  );
  updatedClips.push(...tiledClips);
  return updatedClips;
}

/**
 * Handle arrangement clip shortening
 * @param {object} root0 - Parameters object
 * @param {object} root0.clip - The LiveAPI clip object to shorten
 * @param {boolean} root0.isAudioClip - Whether the clip is an audio clip
 * @param {number} root0.arrangementLengthBeats - Target length in beats
 * @param {number} root0.currentStartTime - Current start time in beats
 * @param {number} root0.currentEndTime - Current end time in beats
 * @param {object} root0.context - Tool execution context
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

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);

  // Create temporary clip to truncate
  if (isAudioClip) {
    const { clip: sessionClip, slot } = createAudioClipInSession(
      track,
      tempClipLength,
      context.silenceWavPath,
    );
    const tempResult = track.call(
      "duplicate_clip_to_arrangement",
      `id ${sessionClip.id}`,
      newEndTime,
    );
    const tempClip = LiveAPI.from(tempResult);
    // Re-apply warping and looping to arrangement clip
    tempClip.set("warping", 1);
    tempClip.set("looping", 1);
    tempClip.set("loop_end", tempClipLength);
    slot.call("delete_clip");
    track.call("delete_clip", `id ${tempClip.id}`);
  } else {
    const tempClipResult = track.call(
      "create_midi_clip",
      newEndTime,
      tempClipLength,
    );
    const tempClip = LiveAPI.from(tempClipResult);
    track.call("delete_clip", `id ${tempClip.id}`);
  }
}
