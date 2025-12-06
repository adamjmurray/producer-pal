import * as console from "#src/shared/v8-max-console.js";
import { ALL_VALID_DEVICES, VALID_DEVICES } from "../../constants.js";

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
 * Creates a native Live device on a track, or lists available devices
 * @param {object} args - The device parameters
 * @param {string} [args.trackCategory="regular"] - Track category: "regular", "return", or "master"
 * @param {number} [args.trackIndex] - 0-based track index (required for regular/return)
 * @param {string} [args.deviceName] - Device name, omit to list available devices
 * @param {number} [args.deviceIndex] - Position in device chain (omit to append)
 * @param {object} _context - Internal context object (unused)
 * @returns {object} Device list, or object with deviceId and deviceIndex
 */
export function createDevice(
  { trackCategory = "regular", trackIndex, deviceName, deviceIndex } = {},
  _context = {},
) {
  // List mode: return valid devices when deviceName is omitted
  if (deviceName == null) {
    return VALID_DEVICES;
  }

  // Create mode: validate trackIndex based on category
  if (trackCategory === "master") {
    if (trackIndex != null) {
      console.error("createDevice: trackIndex is ignored for master track");
    }
  } else if (trackIndex == null) {
    throw new Error(
      `createDevice failed: trackIndex is required for ${trackCategory} tracks`,
    );
  }

  validateDeviceName(deviceName);

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
