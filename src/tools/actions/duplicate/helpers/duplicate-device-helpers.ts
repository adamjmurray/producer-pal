// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { moveDeviceToPath } from "#src/tools/device/update/helpers/update-device-helpers.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import {
  getNameForIndex,
  parseCommaSeparatedNames,
  warnExtraNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { pathEntries } from "#src/tools/shared/validation/object-path-helpers.ts";

/**
 * Duplicates a device to one or more destination paths.
 * Supports comma-separated toPath for multiple destinations.
 * @param object - LiveAPI device object
 * @param toPath - Destination path(s), comma-separated for multiple
 * @param name - Optional name for duplicated device(s)
 * @param count - Number of copies (warns if > 1)
 * @returns Result object, or an array of them for multiple destinations
 */
export function duplicateDeviceWithPaths(
  object: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
  count: number,
): object | object[] {
  // Reads a blank toPath as omitted the way clips do, and refuses one that
  // names nothing rather than quietly falling back to the default destination.
  const paths = pathEntries(toPath, "toPath");

  if (paths.length <= 1) {
    // A lone copy that was skipped has nothing to report but its warning.
    return duplicateDevice(object, paths[0], name, count) ?? [];
  }

  const parsedNames = parseCommaSeparatedNames(name, paths.length);

  warnExtraNames(parsedNames, paths.length, "duplicate");

  // Always an array here: one object back from a two-destination call would
  // read as a one-destination call that worked.
  return paths
    .map((path, i) =>
      duplicateDevice(object, path, getNameForIndex(name, i, parsedNames), 1),
    )
    .filter((result) => result != null);
}

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
 * @returns The new device, or null when the copy was skipped
 */
function duplicateDevice(
  device: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
  count = 1,
): { id: string } | null {
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
  const tempDevicePath = `${livePath.track(tempTrackIndex)} ${devicePathWithinTrack}`;

  // From here on a full copy of the source track — devices, clips and all — is
  // parked at tempTrackIndex, so every exit deletes it. Anything that throws in
  // between (a bad destination path, an unreachable chain) used to strand it.
  try {
    // 4. Find the corresponding device on the temp track
    const tempDevice = LiveAPI.from(tempDevicePath);

    if (!tempDevice.exists()) {
      throw new Error(
        `duplicate failed: device not found in duplicated track at path "${tempDevicePath}"`,
      );
    }

    // 5. Determine destination path
    const destination = toPath ?? calculateDefaultDestination(device.path);

    // 6. Adjust destination if it references tracks after the source track
    const adjustedDestination = adjustTrackIndicesForTempTrack(
      destination,
      trackIndex,
    );

    // 7. Move the copy to the destination. Skip rather than throw, so the other
    // destinations of a comma-separated toPath still get their copies. Name the
    // caller's toPath, not the adjusted one — the temp track shifted its track
    // index. Either way nothing survives: the copy is still on the temp track,
    // which the cleanup below deletes.
    const outcome = moveDeviceToPath(
      tempDevice,
      adjustedDestination,
      device,
      destination,
    );

    if (outcome === "no-destination") {
      console.warn(`duplicate: no destination at toPath "${destination}"`);

      return null;
    }

    if (outcome === "refused") {
      console.warn(
        `duplicate: the copy could not be moved to "${destination}"`,
      );

      return null;
    }

    // A path that didn't resolve at all already warned why, naming this path.
    if (outcome === "unresolvable") {
      return null;
    }

    // 8. Set name if provided
    if (name) {
      tempDevice.set("name", name);
    }

    // 9. Read the device's id before the temp track goes away
    return { id: tempDevice.id };
  } finally {
    // Moving a device creates and deletes no tracks, so the temp track is still
    // where duplicate_track put it.
    liveSet.call("delete_track", tempTrackIndex);
  }
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
 * @returns Simplified path for destination
 */
function calculateDefaultDestination(devicePath: string): string {
  // Never null here: extractRegularTrackIndex already matched the same
  // "live_set tracks N" prefix extractDevicePath needs.
  const simplifiedPath = assertDefined(
    extractDevicePath(devicePath),
    `device path for "${devicePath}"`,
  );

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
