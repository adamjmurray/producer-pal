// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { moveDeviceToPath } from "#src/tools/device/update/update-device-helpers.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";

/**
 * Duplicate a device using the track duplication workaround.
 * Since Ableton Live has no native duplicate_device API, we:
 * 1. Duplicate the track containing the device
 * 2. Move the duplicated device to the destination
 * 3. Delete the temporary track
 *
 * @param device - LiveAPI device object to duplicate
 * @param toPath - Destination path (e.g., "t1/d0", "t0/d0/c0/d1")
 * @param name - Optional name for the duplicated device
 * @param count - Number of duplicates (only 1 supported, warns if > 1)
 * @returns Result with duplicated device info
 */
export function duplicateDevice(
  device: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
  count = 1,
): { id: string } {
  if (count > 1) {
    console.warn(
      "count parameter ignored for device duplication (only single copy supported)",
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
  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call("duplicate_track", trackIndex);
  const tempTrackIndex = trackIndex + 1;

  // 4. Find the corresponding device on the temp track
  const tempDevicePath = `${livePath.track(tempTrackIndex).toString()} ${devicePathWithinTrack}`;
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
  const currentTempTrackIndex = recalculateTempTrackIndex(tempTrackIndex);

  // 11. Delete the temporary track
  liveSet.call("delete_track", currentTempTrackIndex);

  return { id: deviceId };
}

/**
 * Extract the regular track index from a device path
 * @param devicePath - Live API device path
 * @returns Track index or null if return/master track
 */
function extractRegularTrackIndex(devicePath: string): number | null {
  const match = devicePath.match(/^live_set tracks (\d+)/);

  return match ? Number.parseInt(match[1] as string) : null;
}

/**
 * Extract the device portion of the path (everything after the track)
 * @param devicePath - Full Live API path (e.g., "live_set tracks 1 devices 0 chains 2 devices 1")
 * @returns Device path within track (e.g., "devices 0 chains 2 devices 1")
 */
function extractDevicePathWithinTrack(devicePath: string): string {
  const match = devicePath.match(
    /^live_set (?:tracks \d+|return_tracks \d+|master_track) (.+)$/,
  );

  if (!match) {
    throw new Error(
      `duplicate failed: cannot extract device path from "${devicePath}"`,
    );
  }

  return match[1] as string;
}

/**
 * Calculate the default destination: position after the original device on the same track
 * @param devicePath - Full Live API path of the source device
 * @param trackIndex - Track index
 * @returns Simplified path for destination
 */
function calculateDefaultDestination(
  devicePath: string,
  trackIndex: number,
): string {
  // Get simplified path (e.g., "t1/d0/c2/d1")
  const simplifiedPath = extractDevicePath(devicePath);

  if (!simplifiedPath) {
    // Fallback: append to the track
    return `t${trackIndex}`;
  }

  // Parse the path to increment the last device index
  const segments = simplifiedPath.split("/");
  const lastSegment = segments.at(-1);

  if (lastSegment?.startsWith("d")) {
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
 * @param toPath - Destination path
 * @param sourceTrackIndex - Index of the source track that was duplicated
 * @returns Adjusted path
 */
function adjustTrackIndicesForTempTrack(
  toPath: string,
  sourceTrackIndex: number,
): string {
  const match = toPath.match(/^t(\d+)/);

  if (!match) {
    return toPath; // Not a regular track path (return/master), no adjustment needed
  }

  const destTrackIndex = Number.parseInt(match[1] as string);

  // If destination is after the source track, increment by 1
  // (because the temp track was inserted at sourceTrackIndex + 1)
  if (destTrackIndex > sourceTrackIndex) {
    return toPath.replace(/^t\d+/, `t${destTrackIndex + 1}`);
  }

  return toPath;
}

/**
 * Recalculate the temp track's index after the device has been moved.
 * Device movement doesn't create/delete tracks, so temp track index is stable.
 * @param originalTempTrackIndex - Original index of the temp track (sourceTrackIndex + 1)
 * @returns Current index of the temp track
 */
function recalculateTempTrackIndex(originalTempTrackIndex: number): number {
  return originalTempTrackIndex;
}
