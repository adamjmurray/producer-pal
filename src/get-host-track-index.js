export function getHostTrackIndex() {
  try {
    const device = new LiveAPI("this_device");
    const match = device.path.match(/live_set tracks (\d+)/);
    return match ? Number(match[1]) : null;
  } catch (error) {
    return null;
  }
}
