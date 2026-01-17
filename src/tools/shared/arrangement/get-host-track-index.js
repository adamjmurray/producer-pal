// @ts-nocheck -- TODO: Add JSDoc type annotations
/**
 * Get the track index of the host device
 * @returns {number|null} - Track index or null if not found
 */
export function getHostTrackIndex() {
  try {
    const device = LiveAPI.from("this_device");

    return device.trackIndex;
  } catch {
    return null;
  }
}
