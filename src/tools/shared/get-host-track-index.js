export function getHostTrackIndex() {
  try {
    const device = new LiveAPI("this_device");
    return device.trackIndex;
  } catch (_error) {
    return null;
  }
}
