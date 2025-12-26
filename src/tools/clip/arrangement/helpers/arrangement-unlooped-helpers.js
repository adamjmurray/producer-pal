import {
  createShortenedClipInHolding,
  moveClipFromHolding,
} from "../../../shared/arrangement/arrangement-tiling.js";
import { revealAudioContentAtPosition } from "../../update/helpers/update-clip-audio-helpers.js";

const EPSILON = 0.001;

/**
 * Handle unlooped clip lengthening
 * @param {object} root0 - Parameters object
 * @param {object} root0.clip - The LiveAPI clip object
 * @param {boolean} root0.isAudioClip - Whether the clip is an audio clip
 * @param {number} root0.arrangementLengthBeats - Target length in beats
 * @param {number} root0.currentArrangementLength - Current length in beats
 * @param {number} root0._currentStartTime - Current start time in beats (unused)
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
  _currentStartTime,
  currentEndTime,
  clipStartMarker,
  track,
  context,
}) {
  const updatedClips = [];

  // MIDI clip handling - tile with chunks matching the current arrangement length
  // Each tile shows a different portion of the clip content
  if (!isAudioClip) {
    const tileSize = currentArrangementLength;
    const targetEndMarker = clipStartMarker + arrangementLengthBeats;

    // Extend source clip's end_marker to target
    clip.set("end_marker", targetEndMarker);
    updatedClips.push({ id: clip.id });

    // Create tiles for remaining space
    let currentPosition = currentEndTime;
    let currentContentOffset = clipStartMarker + currentArrangementLength;
    const holdingAreaStart = context.holdingAreaStartBeats;

    while (
      currentPosition <
      currentEndTime +
        (arrangementLengthBeats - currentArrangementLength) -
        EPSILON
    ) {
      const remainingSpace =
        currentEndTime +
        (arrangementLengthBeats - currentArrangementLength) -
        currentPosition;
      const tileLengthNeeded = Math.min(tileSize, remainingSpace);
      const isPartialTile = tileSize - tileLengthNeeded > EPSILON;

      const tileStartMarker = currentContentOffset;
      const tileEndMarker = tileStartMarker + tileLengthNeeded;

      let tileClip;

      if (isPartialTile) {
        // Partial tiles use holding area to avoid overwriting subsequent clips
        const { holdingClipId } = createShortenedClipInHolding(
          clip,
          track,
          tileLengthNeeded,
          holdingAreaStart,
          true, // isMidiClip
          context,
        );

        tileClip = moveClipFromHolding(holdingClipId, track, currentPosition);
      } else {
        // Full tiles use direct duplication
        const duplicateResult = track.call(
          "duplicate_clip_to_arrangement",
          `id ${clip.id}`,
          currentPosition,
        );

        tileClip = LiveAPI.from(duplicateResult);
      }

      // Set markers using looping workaround
      tileClip.set("looping", 1);
      tileClip.set("loop_end", tileEndMarker);
      tileClip.set("loop_start", tileStartMarker);
      tileClip.set("end_marker", tileEndMarker);
      tileClip.set("start_marker", tileStartMarker);
      // eslint-disable-next-line sonarjs/no-element-overwrite -- looping workaround pattern
      tileClip.set("looping", 0);

      updatedClips.push({ id: tileClip.id });

      currentPosition += tileLengthNeeded;
      currentContentOffset += tileLengthNeeded;
    }

    return updatedClips;
  }

  // Audio clip handling
  // Note: We don't try to detect hidden content - just attempt to extend
  // and let Live handle it (fills with silence if audio runs out)
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
  const targetEndMarker = clipStartMarkerBeats + arrangementLengthBeats;

  // Always attempt to reveal - calculate based on requested length
  const remainingToReveal = arrangementLengthBeats - currentArrangementLength;
  const newStartMarker = visibleContentEnd;
  const newEndMarker = newStartMarker + remainingToReveal;

  // For warped clips, extend source clip's end_marker so duplicate inherits extended content bounds
  if (isWarped) {
    clip.set("end_marker", targetEndMarker);
  }

  const revealedClip = revealAudioContentAtPosition(
    clip,
    track,
    newStartMarker,
    newEndMarker,
    currentEndTime,
    context,
  );

  updatedClips.push({ id: clip.id });
  updatedClips.push({ id: revealedClip.id });

  return updatedClips;
}
