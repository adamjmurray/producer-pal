/**
 * Get the track index of the host device
 * @returns {number|null} - Track index or null if not found
 */
export function getHostTrackIndex() {
  try {
    const device = new LiveAPI("this_device");

    return device.trackIndex;
  } catch (_error) {
    return null;
  }
}
