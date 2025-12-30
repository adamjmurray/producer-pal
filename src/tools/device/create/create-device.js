import * as console from "#src/shared/v8-max-console.js";
import { ALL_VALID_DEVICES, VALID_DEVICES } from "#src/tools/constants.js";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/device-path-helpers.js";

/**
 * Validate device name and throw error with valid options if invalid
 * @param {string} deviceName - Device name to validate
 */
function validateDeviceName(deviceName) {
  if (ALL_VALID_DEVICES.includes(deviceName)) {
    return;
  }

  const validList =
    `Instruments: ${VALID_DEVICES.instruments.join(", ")} | ` +
    `MIDI Effects: ${VALID_DEVICES.midiEffects.join(", ")} | ` +
    `Audio Effects: ${VALID_DEVICES.audioEffects.join(", ")}`;

  throw new Error(
    `createDevice failed: invalid deviceName "${deviceName}". Valid devices - ${validList}`,
  );
}

/**
 * Creates a native Live device on a track or chain, or lists available devices
 * @param {object} args - The device parameters
 * @param {string} [args.trackCategory="regular"] - Track category: "regular", "return", or "master"
 * @param {number} [args.trackIndex] - 0-based track index (required for regular/return)
 * @param {string} [args.deviceName] - Device name, omit to list available devices
 * @param {number} [args.deviceIndex] - Position in device chain (omit to append)
 * @param {string} [args.path] - Device path (e.g., "0/0/0" to append, "0/0/0/1" for position)
 * @param {object} _context - Internal context object (unused)
 * @returns {object} Device list, or object with deviceId and deviceIndex
 */
export function createDevice(
  { trackCategory = "regular", trackIndex, deviceName, deviceIndex, path } = {},
  _context = {},
) {
  // List mode: return valid devices when deviceName is omitted
  if (deviceName == null) {
    return VALID_DEVICES;
  }

  validateDeviceName(deviceName);

  // Path-based insertion
  if (path != null) {
    return createDeviceAtPath(deviceName, path, deviceIndex);
  }

  // Track-based insertion (original behavior)
  return createDeviceOnTrack(
    deviceName,
    trackCategory,
    trackIndex,
    deviceIndex,
  );
}

/**
 * Create device at a path (track or chain)
 * @param {string} deviceName - Device name
 * @param {string} path - Device path
 * @param {number} [deviceIndex] - Ignored if provided (position is in path)
 * @returns {object} Object with deviceId and deviceIndex
 */
function createDeviceAtPath(deviceName, path, deviceIndex) {
  if (deviceIndex != null) {
    console.error("createDevice: deviceIndex is ignored when path is provided");
  }

  const { container, position } = resolveInsertionPath(path);

  if (!container || !container.exists()) {
    throw new Error(
      `createDevice failed: container at path "${path}" does not exist`,
    );
  }

  const result =
    position != null
      ? container.call("insert_device", deviceName, position)
      : container.call("insert_device", deviceName);

  const deviceId = result[1];
  const device = deviceId ? new LiveAPI(`id ${deviceId}`) : null;

  if (!device || !device.exists()) {
    const positionDesc = position != null ? `position ${position}` : "end";

    throw new Error(
      `createDevice failed: could not insert "${deviceName}" at ${positionDesc} in path "${path}"`,
    );
  }

  return {
    deviceId,
    deviceIndex: device.deviceIndex,
  };
}

/**
 * Create device on a track (original behavior)
 * @param {string} deviceName - Device name
 * @param {string} trackCategory - Track category
 * @param {number} trackIndex - Track index
 * @param {number} [deviceIndex] - Position in device chain
 * @returns {object} Object with deviceId and deviceIndex
 */
function createDeviceOnTrack(
  deviceName,
  trackCategory,
  trackIndex,
  deviceIndex,
) {
  // Validate trackIndex based on category
  if (trackCategory === "master") {
    if (trackIndex != null) {
      console.error("createDevice: trackIndex is ignored for master track");
    }
  } else if (trackIndex == null) {
    throw new Error(
      `createDevice failed: trackIndex is required for ${trackCategory} tracks`,
    );
  }

  // Build track path based on trackCategory
  let trackPath;

  if (trackCategory === "regular") {
    trackPath = `live_set tracks ${trackIndex}`;
  } else if (trackCategory === "return") {
    trackPath = `live_set return_tracks ${trackIndex}`;
  } else {
    trackPath = "live_set master_track";
  }

  const track = new LiveAPI(trackPath);

  if (!track.exists()) {
    const trackDesc =
      trackCategory === "master"
        ? "master track"
        : `${trackCategory} track ${trackIndex}`;

    throw new Error(`createDevice failed: ${trackDesc} does not exist`);
  }

  const result =
    deviceIndex != null
      ? track.call("insert_device", deviceName, deviceIndex)
      : track.call("insert_device", deviceName);

  const deviceId = result[1];
  const device = deviceId ? new LiveAPI(`id ${deviceId}`) : null;

  if (!device || !device.exists()) {
    const position = deviceIndex != null ? `index ${deviceIndex}` : "end";

    throw new Error(
      `createDevice failed: could not insert "${deviceName}" at ${position}`,
    );
  }

  return {
    deviceId,
    deviceIndex: device.deviceIndex,
  };
}
