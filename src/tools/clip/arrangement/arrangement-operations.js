import * as console from "#src/shared/v8-max-console.js";
import {
  handleArrangementLengthening,
  handleArrangementShortening,
} from "./helpers/arrangement-operations-helpers.js";

/**
 * Handle arrangement length changes (lengthening via tiling/exposure or shortening)
 * @param {object} args - Operation arguments
 * @param {object} args.clip - The LiveAPI clip object
 * @param {boolean} args.isAudioClip - Whether the clip is an audio clip
 * @param {number} args.arrangementLengthBeats - Target length in beats
 * @param {object} args.context - Tool execution context
 * @returns {Array} Array of clip result objects to add to updatedClips
 */
export function handleArrangementLengthOperation({
  clip,
  isAudioClip,
  arrangementLengthBeats,
  context,
}) {
  const updatedClips = [];
  const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;

  if (!isArrangementClip) {
    console.error(
      `Warning: arrangementLength parameter ignored for session clip (id ${clip.id})`,
    );
    return updatedClips;
  }

  // Get current clip dimensions
  const currentStartTime = clip.getProperty("start_time");
  const currentEndTime = clip.getProperty("end_time");
  const currentArrangementLength = currentEndTime - currentStartTime;

  // Check if shortening, lengthening, or same
  if (arrangementLengthBeats > currentArrangementLength) {
    // Lengthening via tiling or hidden content exposure
    const result = handleArrangementLengthening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentArrangementLength,
      currentStartTime,
      currentEndTime,
      context,
    });
    updatedClips.push(...result);
  } else if (arrangementLengthBeats < currentArrangementLength) {
    // Shortening: Use temp clip overlay pattern
    handleArrangementShortening({
      clip,
      isAudioClip,
      arrangementLengthBeats,
      currentStartTime,
      currentEndTime,
      context,
    });
  }

  return updatedClips;
}
