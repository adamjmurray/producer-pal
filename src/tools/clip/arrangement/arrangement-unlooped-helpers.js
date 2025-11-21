import {
  getActualAudioEnd,
  revealUnwarpedAudioContent,
} from "../update/helpers/update-clip-audio-helpers.js";
import { getActualContentEnd } from "../update/helpers/update-clip-helpers.js";

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
export function handleUnloopedLengthening({
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
    const EPSILON = 0.001;
    if (actualContentEnd - visibleContentEnd > EPSILON) {
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
      // eslint-disable-next-line sonarjs/no-element-overwrite
      revealedClip.set("looping", 0);
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
  const EPSILON = isWarped ? 0.1 : 1.0;
  if (actualAudioEnd - visibleContentEnd > EPSILON) {
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
      // eslint-disable-next-line sonarjs/no-element-overwrite
      revealedClip.set("looping", 0);
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
