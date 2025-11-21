import {
  createAudioClipInSession,
  tileClipToRange,
} from "../../shared/arrangement/arrangement-tiling.js";
import {
  getActualAudioEnd,
  revealUnwarpedAudioContent,
} from "../update/helpers/update-clip-audio-helpers.js";
import { getActualContentEnd } from "../update/helpers/update-clip-helpers.js";

/**
 * Handle lengthening of arrangement clips via tiling or content exposure
 * @param {object} root0 - Parameters object
 * @param root0.clip
 * @param root0.isAudioClip
 * @param root0.arrangementLengthBeats
 * @param root0.currentArrangementLength
 * @param root0.currentStartTime
 * @param root0.currentEndTime
 * @param root0.context
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
  const clipLength = isLooping
    ? clipLoopEnd - clipLoopStart
    : clipEndMarker - clipStartMarker;
  const trackIndex = clip.trackIndex;
  if (trackIndex == null) {
    throw new Error(
      `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
    );
  }
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
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
  if (arrangementLengthBeats < clipLength) {
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
 * @param root0.clip
 * @param root0.isAudioClip
 * @param root0.arrangementLengthBeats
 * @param root0.currentArrangementLength
 * @param root0.currentStartTime
 * @param root0.currentEndTime
 * @param root0.clipStartMarker
 * @param root0.track
 * @param root0.context
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
  if (!isAudioClip) {
    const actualContentEnd = getActualContentEnd(clip);
    const visibleContentEnd = clipStartMarker + currentArrangementLength;
    if (actualContentEnd - visibleContentEnd > 0.001) {
      const revealLength = Math.min(
        actualContentEnd - clipStartMarker,
        arrangementLengthBeats,
      );
      const remainingToReveal = revealLength - currentArrangementLength;
      clip.set("end_marker", actualContentEnd);
      const duplicateResult = track.call(
        "duplicate_clip_to_arrangement",
        `id ${clip.id}`,
        currentEndTime,
      );
      const revealedClip = LiveAPI.from(duplicateResult);
      const newStartMarker = visibleContentEnd;
      const newEndMarker = newStartMarker + remainingToReveal;
      revealedClip.set("looping", 1);
      revealedClip.set("end_marker", newEndMarker);
      revealedClip.set("start_marker", newStartMarker);
      revealedClip.set("looping", 0); // eslint-disable-line sonarjs/no-element-overwrite
      updatedClips.push({ id: clip.id });
      updatedClips.push({ id: revealedClip.id });
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
  if (actualAudioEnd - visibleContentEnd > (isWarped ? 0.1 : 1.0)) {
    const revealLength = Math.min(
      actualAudioEnd - clipStartMarkerBeats,
      arrangementLengthBeats,
    );
    const remainingToReveal = revealLength - currentArrangementLength;
    const newStartMarker = visibleContentEnd;
    const newEndMarker = newStartMarker + remainingToReveal;
    let revealedClip;
    if (isWarped) {
      clip.set("end_marker", actualAudioEnd);
      const duplicateResult = track.call(
        "duplicate_clip_to_arrangement",
        `id ${clip.id}`,
        currentEndTime,
      );
      revealedClip = LiveAPI.from(duplicateResult);
      revealedClip.set("looping", 1);
      revealedClip.set("loop_end", newEndMarker);
      revealedClip.set("loop_start", newStartMarker);
      revealedClip.set("end_marker", newEndMarker);
      revealedClip.set("start_marker", newStartMarker);
      revealedClip.set("looping", 0); // eslint-disable-line sonarjs/no-element-overwrite
    } else {
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
  updatedClips.push({ id: clip.id });
  return updatedClips;
}

/**
 * Create tiles for looped clips
 * @param {object} root0 - Parameters object
 * @param root0.clip
 * @param root0.isAudioClip
 * @param root0.arrangementLengthBeats
 * @param root0.currentArrangementLength
 * @param root0.currentStartTime
 * @param root0.currentEndTime
 * @param root0._clipLoopStart
 * @param root0._clipLoopEnd
 * @param root0._clipStartMarker
 * @param root0.totalContentLength
 * @param root0.currentOffset
 * @param root0.track
 * @param root0.context
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
  if (currentArrangementLength > totalContentLength) {
    let newEndTime = currentStartTime + totalContentLength;
    const tempClipLength = currentEndTime - newEndTime;
    if (newEndTime + tempClipLength !== currentEndTime) {
      throw new Error(
        `Shortening validation failed: calculation error in temp clip bounds`,
      );
    }
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
 * @param root0.clip
 * @param root0.isAudioClip
 * @param root0.arrangementLengthBeats
 * @param root0.currentStartTime
 * @param root0.currentEndTime
 * @param root0.context
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
  if (newEndTime + tempClipLength !== currentEndTime) {
    throw new Error(
      `Internal error: temp clip boundary calculation failed for clip ${clip.id}`,
    );
  }
  const trackIndex = clip.trackIndex;
  if (trackIndex == null) {
    throw new Error(
      `updateClip failed: could not determine trackIndex for clip ${clip.id}`,
    );
  }
  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
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
