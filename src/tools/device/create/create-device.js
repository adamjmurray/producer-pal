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
 * Extract device index from device path
 * @param {string} path - Device path like "live_set tracks 0 devices 2"
 * @returns {number|null} Device index or null if not found
 */
function extractDeviceIndex(path) {
  const match = path.match(/devices (\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * Creates a native Live device on a track, or lists available devices
 * @param {object} args - The device parameters
 * @param {number} [args.trackIndex] - 0-based track index (required when creating)
 * @param {string} [args.deviceName] - Device name, omit to list available devices
 * @param {number} [args.deviceIndex] - Position in device chain (omit to append)
 * @param {object} _context - Internal context object (unused)
 * @returns {object} Device list, or object with deviceId and deviceIndex
 */
export function createDevice(
  { trackIndex, deviceName, deviceIndex } = {},
  _context = {},
) {
  // List mode: return valid devices when deviceName is omitted
  if (deviceName == null) {
    return VALID_DEVICES;
  }

  // Create mode: trackIndex is required
  if (trackIndex == null) {
    throw new Error(
      "createDevice failed: trackIndex is required when creating a device",
    );
  }

  validateDeviceName(deviceName);

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  if (!track.exists()) {
    throw new Error(`createDevice failed: track ${trackIndex} does not exist`);
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
    deviceIndex: extractDeviceIndex(device.path),
  };
}
