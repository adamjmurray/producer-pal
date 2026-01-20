export interface ClipMarkers {
  /** Loop start position (optional) */
  loopStart?: number;
  /** Loop end position (optional) */
  loopEnd?: number;
  /** Start marker position */
  startMarker: number;
  /** End marker position */
  endMarker: number;
}

/**
 * Set clip markers using the looping workaround
 *
 * Ableton Live requires looping to be enabled to set certain markers.
 * This helper enables looping, sets all markers, then disables looping.
 *
 * @param clip - The clip to modify
 * @param markers - Marker values to set
 * @param markers.loopStart - Loop start position (optional)
 * @param markers.loopEnd - Loop end position (optional)
 * @param markers.startMarker - Start marker position
 * @param markers.endMarker - End marker position
 */
export function setClipMarkersWithLoopingWorkaround(
  clip: LiveAPI,
  { loopStart, loopEnd, startMarker, endMarker }: ClipMarkers,
): void {
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
