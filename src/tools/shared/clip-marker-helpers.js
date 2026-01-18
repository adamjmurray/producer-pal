/**
 * Set clip markers using the looping workaround
 *
 * Ableton Live requires looping to be enabled to set certain markers.
 * This helper enables looping, sets all markers, then disables looping.
 *
 * @param {LiveAPI} clip - The clip to modify
 * @param {object} markers - Marker values to set
 * @param {number} [markers.loopStart] - Loop start position (optional)
 * @param {number} [markers.loopEnd] - Loop end position (optional)
 * @param {number} markers.startMarker - Start marker position
 * @param {number} markers.endMarker - End marker position
 */
export function setClipMarkersWithLoopingWorkaround(
  clip,
  { loopStart, loopEnd, startMarker, endMarker },
) {
  clip.set("looping", 1);

  if (loopEnd != null) {
    clip.set("loop_end", loopEnd);
  }

  if (loopStart != null) {
    clip.set("loop_start", loopStart);
  }

  clip.set("end_marker", endMarker);
  clip.set("start_marker", startMarker);

  clip.set("looping", 0);
}
