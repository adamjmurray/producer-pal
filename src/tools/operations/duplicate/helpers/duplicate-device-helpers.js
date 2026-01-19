import * as console from "#src/shared/v8-max-console.js";
import { moveDeviceToPath } from "#src/tools/device/update/update-device-helpers.js";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-helpers.js";

/**
 * Duplicate a device using the track duplication workaround.
 * Since Ableton Live has no native duplicate_device API, we:
 * 1. Duplicate the track containing the device
 * 2. Move the duplicated device to the destination
 * 3. Delete the temporary track
 *
 * @param {LiveAPI} device - LiveAPI device object to duplicate
 * @param {string} [toPath] - Destination path (e.g., "t1/d0", "t0/d0/c0/d1")
 * @param {string} [name] - Optional name for the duplicated device
 * @param {number} [count=1] - Number of duplicates (only 1 supported, warns if > 1)
 * @returns {{ id: string }} Result with duplicated device info
 */
export function duplicateDevice(device, toPath, name, count = 1) {
  if (count > 1) {
    console.error(
      "Warning: count parameter ignored for device duplication (only single copy supported)",
    );
  }

  // 1. Validate device is on a regular track (not return/master)
  const trackIndex = extractRegularTrackIndex(device.path);

  if (trackIndex == null) {
    throw new Error(
      "duplicate failed: cannot duplicate devices on return/master tracks",
    );
  }

  // 2. Get device's relative path within the track
  const devicePathWithinTrack = extractDevicePathWithinTrack(device.path);

  // 3. Duplicate the track
  const liveSet = LiveAPI.from("live_set");

  liveSet.call("duplicate_track", trackIndex);
  const tempTrackIndex = trackIndex + 1;

  // 4. Find the corresponding device on the temp track
  const tempDevicePath = `live_set tracks ${tempTrackIndex} ${devicePathWithinTrack}`;
  const tempDevice = LiveAPI.from(tempDevicePath);

  if (!tempDevice.exists()) {
    // Clean up temp track and throw
    liveSet.call("delete_track", tempTrackIndex);
    throw new Error(
      `duplicate failed: device not found in duplicated track at path "${tempDevicePath}"`,
    );
  }

  // 5. Determine destination path
  const destination =
    toPath ?? calculateDefaultDestination(device.path, trackIndex);

  // 6. Adjust destination if it references tracks after the source track
  const adjustedDestination = adjustTrackIndicesForTempTrack(
    destination,
    trackIndex,
  );

  // 7. Move device to destination
  moveDeviceToPath(tempDevice, adjustedDestination);

  // 8. Set name if provided
  if (name) {
    tempDevice.set("name", name);
  }

  // 9. Get device info before deleting temp track
  const deviceId = tempDevice.id;

  // 10. Calculate the temp track's current index (may have shifted if device moved before it)
  const currentTempTrackIndex = recalculateTempTrackIndex(
    tempTrackIndex,
    adjustedDestination,
  );

  // 11. Delete the temporary track
  liveSet.call("delete_track", currentTempTrackIndex);

  return { id: deviceId };
}

/**
 * Extract the regular track index from a device path
 * @param {string} devicePath - Live API device path
 * @returns {number|null} Track index or null if return/master track
 */
function extractRegularTrackIndex(devicePath) {
  const match = devicePath.match(/^live_set tracks (\d+)/);

  return match ? Number.parseInt(/** @type {string} */ (match[1])) : null;
}

/**
 * Extract the device portion of the path (everything after the track)
 * @param {string} devicePath - Full Live API path (e.g., "live_set tracks 1 devices 0 chains 2 devices 1")
 * @returns {string} Device path within track (e.g., "devices 0 chains 2 devices 1")
 */
function extractDevicePathWithinTrack(devicePath) {
  const match = devicePath.match(
    /^live_set (?:tracks \d+|return_tracks \d+|master_track) (.+)$/,
  );

  if (!match) {
    throw new Error(
      `duplicate failed: cannot extract device path from "${devicePath}"`,
    );
  }

  return /** @type {string} */ (match[1]);
}

/**
 * Calculate the default destination: position after the original device on the same track
 * @param {string} devicePath - Full Live API path of the source device
 * @param {number} trackIndex - Track index
 * @returns {string} Simplified path for destination
 */
function calculateDefaultDestination(devicePath, trackIndex) {
  // Get simplified path (e.g., "t1/d0/c2/d1")
  const simplifiedPath = extractDevicePath(devicePath);

  if (!simplifiedPath) {
    // Fallback: append to the track
    return `t${trackIndex}`;
  }

  // Parse the path to increment the last device index
  const segments = simplifiedPath.split("/");
  const lastSegment = segments.at(-1);

  if (lastSegment != null && lastSegment.startsWith("d")) {
    const deviceIndex = Number.parseInt(lastSegment.slice(1));

    segments[segments.length - 1] = `d${deviceIndex + 1}`;

    return segments.join("/");
  }

  // Fallback: append to the container
  return simplifiedPath;
}

/**
 * Adjust track indices in the destination path to account for the temporary track.
 * When we duplicate a track at index N, a new track appears at N+1.
 * So any destination referencing tracks > N needs to be incremented.
 * @param {string} toPath - Destination path
 * @param {number} sourceTrackIndex - Index of the source track that was duplicated
 * @returns {string} Adjusted path
 */
function adjustTrackIndicesForTempTrack(toPath, sourceTrackIndex) {
  const match = toPath.match(/^t(\d+)/);

  if (!match) {
    return toPath; // Not a regular track path (return/master), no adjustment needed
  }

  const destTrackIndex = Number.parseInt(/** @type {string} */ (match[1]));

  // If destination is after the source track, increment by 1
  // (because the temp track was inserted at sourceTrackIndex + 1)
  if (destTrackIndex > sourceTrackIndex) {
    return toPath.replace(/^t\d+/, `t${destTrackIndex + 1}`);
  }

  return toPath;
}

/**
 * Recalculate the temp track's index after the device has been moved.
 * If the device was moved to a track before the temp track, indices shift.
 * @param {number} originalTempTrackIndex - Original index of the temp track (sourceTrackIndex + 1)
 * @param {string} _destination - The destination path the device was moved to (unused - kept for API clarity)
 * @returns {number} Current index of the temp track
 */
function recalculateTempTrackIndex(originalTempTrackIndex, _destination) {
  // Device movement doesn't create/delete tracks, so temp track index is stable
  // The temp track is always at originalTempTrackIndex after the duplicate_track call
  return originalTempTrackIndex;
}
