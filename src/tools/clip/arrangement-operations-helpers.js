import {
  createAudioClipInSession,
  tileClipToRange,
} from "../shared/arrangement-tiling.js";
import {
  getActualAudioEnd,
  getActualContentEnd,
  revealUnwarpedAudioContent,
} from "./update-clip-helpers.js";

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
 * Handle unlooped clip lengthening
 * @param {object} root0 - Parameters object
 * @param {object} root0.clip - The LiveAPI clip object
 * @param {boolean} root0.isAudioClip - Whether the clip is an audio clip
 * @param {number} root0.arrangementLengthBeats - Target length in beats
 * @param {number} root0.currentArrangementLength - Current length in beats
 * @param {number} root0.currentStartTime - Current start time in beats
 * @param {number} root0.currentEndTime - Current end time in beats
 * @param {number} root0.clipStartMarker - Clip start marker position
 * @param {object} root0.track - The LiveAPI track object
 * @param {object} root0.context - Tool execution context
 * @returns {Array<object>} - Array of updated clip info
 */
function handleUnloopedLengthening({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  currentArrangementLength,
  currentStartTime,
  currentEndTime,
  clipStartMarker,
  track,
  context,
}) {
  const updatedClips = [];
  const spaceNeeded = arrangementLengthBeats - currentArrangementLength;
  // For MIDI clips, determine actual content extent by examining notes
  if (!isAudioClip) {
    const actualContentEnd = getActualContentEnd(clip);
    const visibleContentEnd = clipStartMarker + currentArrangementLength;
    const EPSILON = 0.001;
    if (actualContentEnd - visibleContentEnd > EPSILON) {
      // Hidden content exists - reveal it
      const revealLength = Math.min(
        actualContentEnd - clipStartMarker,
        arrangementLengthBeats,
      );
      const remainingToReveal = revealLength - currentArrangementLength;
      // Set end_marker to actual content end
      clip.set("end_marker", actualContentEnd);
      // Duplicate to reveal hidden content
      const duplicateResult = track.call(
        "duplicate_clip_to_arrangement",
        `id ${clip.id}`,
        currentEndTime,
      );
      const revealedClip = LiveAPI.from(duplicateResult);
      // Set markers on revealed clip using looping workaround
      const newStartMarker = visibleContentEnd;
      const newEndMarker = newStartMarker + remainingToReveal;
      revealedClip.set("looping", 1); // looping needs to be enabled to set the following:
      revealedClip.set("end_marker", newEndMarker);
      revealedClip.set("start_marker", newStartMarker);
      // eslint-disable-next-line sonarjs/no-element-overwrite
      revealedClip.set("looping", 0);
      updatedClips.push({ id: clip.id });
      updatedClips.push({ id: revealedClip.id });
      // Create empty MIDI clips for remaining space if needed
      const remainingSpace = arrangementLengthBeats - revealLength;
      if (remainingSpace > 0) {
        const emptyStartTime = currentStartTime + revealLength;
        const emptyClipResult = track.call(
          "create_midi_clip",
          emptyStartTime,
          remainingSpace,
        );
        const emptyClip = LiveAPI.from(emptyClipResult);
        updatedClips.push({ id: emptyClip.id });
      }
      return updatedClips;
    }
    // No hidden content - create empty MIDI clip for space
    const emptyClipResult = track.call(
      "create_midi_clip",
      currentEndTime,
      spaceNeeded,
    );
    const emptyClip = LiveAPI.from(emptyClipResult);
    updatedClips.push({ id: clip.id });
    updatedClips.push({ id: emptyClip.id });
    return updatedClips;
  }
  // Audio clip handling
  const actualAudioEnd = getActualAudioEnd(clip);
  const isWarped = clip.getProperty("warping") === 1;
  let clipStartMarkerBeats;
  if (isWarped) {
    clipStartMarkerBeats = clipStartMarker;
  } else {
    const liveSet = new LiveAPI("live_set");
    const tempo = liveSet.getProperty("tempo");
    clipStartMarkerBeats = clipStartMarker * (tempo / 60);
  }
  const visibleContentEnd = clipStartMarkerBeats + currentArrangementLength;
  const EPSILON = isWarped ? 0.1 : 1.0;
  if (actualAudioEnd - visibleContentEnd > EPSILON) {
    // Hidden content exists - reveal it
    const revealLength = Math.min(
      actualAudioEnd - clipStartMarkerBeats,
      arrangementLengthBeats,
    );
    const remainingToReveal = revealLength - currentArrangementLength;
    const newStartMarker = visibleContentEnd;
    const newEndMarker = newStartMarker + remainingToReveal;
    let revealedClip;
    if (isWarped) {
      // Warped clips: use looping workaround
      clip.set("end_marker", actualAudioEnd);
      const duplicateResult = track.call(
        "duplicate_clip_to_arrangement",
        `id ${clip.id}`,
        currentEndTime,
      );
      revealedClip = LiveAPI.from(duplicateResult);
      revealedClip.set("looping", 1); // looping needs to be enabled to set the following:
      revealedClip.set("loop_end", newEndMarker);
      revealedClip.set("loop_start", newStartMarker);
      revealedClip.set("end_marker", newEndMarker);
      revealedClip.set("start_marker", newStartMarker);
      // eslint-disable-next-line sonarjs/no-element-overwrite
      revealedClip.set("looping", 0);
    } else {
      // Unwarped clips: use session holding area workaround
      revealedClip = revealUnwarpedAudioContent(
        clip,
        track,
        newStartMarker,
        newEndMarker,
        currentEndTime,
        context,
      );
    }
    updatedClips.push({ id: clip.id });
    updatedClips.push({ id: revealedClip.id });
    return updatedClips;
  }
  // No hidden content - keep original clip
  updatedClips.push({ id: clip.id });
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
