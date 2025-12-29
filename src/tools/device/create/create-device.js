import * as console from "#src/shared/v8-max-console.js";
import {
  ALL_VALID_DEVICES,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  VALID_DEVICES,
} from "../../constants.js";

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

function getDeviceIds(track) {
  if (typeof track.getChildIds === "function") {
    return track.getChildIds("devices");
  }

  const devices = track.get("devices");

  if (!Array.isArray(devices)) {
    return [];
  }

  const ids = [];

  for (let i = 0; i < devices.length; i += 2) {
    if (devices[i] === "id") {
      ids.push(`id ${devices[i + 1]}`);
    }
  }

  return ids;
}

function findInstrumentDeviceIndex(track) {
  const deviceIds = getDeviceIds(track);

  for (let i = 0; i < deviceIds.length; i++) {
    const device = LiveAPI.from(deviceIds[i]);

    if (!device || !device.exists()) {
      continue;
    }

    const type = device.get("type")?.[0];

    if (type === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
      return i;
    }
  }

  return -1;
}

function getInstrumentInsertionIndex(track, deviceIndex) {
  const instrumentIndex = findInstrumentDeviceIndex(track);

  if (instrumentIndex === -1) {
    return deviceIndex;
  }

  track.call("delete_device", instrumentIndex);

  if (deviceIndex == null) {
    return instrumentIndex;
  }

  if (deviceIndex > instrumentIndex) {
    return deviceIndex - 1;
  }

  return deviceIndex;
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
  {
    trackCategory = "regular",
    trackIndex,
    deviceName,
    deviceIndex,
    parentId,
  } = {},
  _context = {},
) {
  // List mode: return valid devices when deviceName is omitted
  if (deviceName == null) {
    return VALID_DEVICES;
  }

  validateDeviceName(deviceName);

  const container =
    parentId != null
      ? LiveAPI.from(parentId)
      : new LiveAPI(
          trackCategory === "regular"
            ? `live_set tracks ${trackIndex}`
            : trackCategory === "return"
              ? `live_set return_tracks ${trackIndex}`
              : "live_set master_track",
        );

  if (parentId == null) {
    if (trackCategory === "master") {
      if (trackIndex != null) {
        console.error("createDevice: trackIndex is ignored for master track");
      }
    } else if (trackIndex == null) {
      throw new Error(
        `createDevice failed: trackIndex is required for ${trackCategory} tracks`,
      );
    }
  }

  if (!container.exists()) {
    const targetDesc =
      parentId != null
        ? `container id ${parentId}`
        : trackCategory === "master"
          ? "master track"
          : `${trackCategory} track ${trackIndex}`;

    throw new Error(`createDevice failed: ${targetDesc} does not exist`);
  }

  const isInstrument = VALID_DEVICES.instruments.includes(deviceName);
  const effectiveDeviceIndex = isInstrument
    ? getInstrumentInsertionIndex(container, deviceIndex)
    : deviceIndex;

  const result =
    effectiveDeviceIndex != null
      ? container.call("insert_device", deviceName, effectiveDeviceIndex)
      : container.call("insert_device", deviceName);

  const deviceId = result[1];
  const device = deviceId ? new LiveAPI(`id ${deviceId}`) : null;

  if (!device || !device.exists()) {
    const position =
      effectiveDeviceIndex != null ? `index ${effectiveDeviceIndex}` : "end";

    throw new Error(
      `createDevice failed: could not insert "${deviceName}" at ${position}`,
    );
  }

  return {
    deviceId,
    deviceIndex: device.deviceIndex,
  };
}
