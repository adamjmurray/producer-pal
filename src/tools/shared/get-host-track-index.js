// src/tools/shared/get-host-track-index.js

export function getHostTrackIndex() {
  try {
    const device = new LiveAPI("this_device");
    return device.trackIndex;
  } catch (error) {
    return null;
  }
}
