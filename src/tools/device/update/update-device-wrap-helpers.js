import * as console from "#src/shared/v8-max-console.js";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.js";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/device-path-helpers.js";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.js";

const RACK_TYPE_TO_DEVICE_NAME = {
  "audio-effect-rack": "Audio Effect Rack",
  "midi-effect-rack": "MIDI Effect Rack",
  "instrument-rack": "Instrument Rack",
};

/**
 * Wrap device(s) in a new rack
 * @param {object} options - The options
 * @param {string} [options.ids] - Comma-separated device ID(s)
 * @param {string} [options.path] - Comma-separated device path(s)
 * @param {string} [options.toPath] - Target path for the new rack
 * @param {string} [options.name] - Name for the new rack
 * @returns {object} Info about the created rack
 */
export function wrapDevicesInRack({ ids, path, toPath, name }) {
  const items = parseCommaSeparatedIds(ids ?? path);
  const isIdBased = ids != null;
  const devices = resolveDevices(items, isIdBased);

  if (devices.length === 0) {
    throw new Error("wrapInRack: no devices found");
  }

  const rackType = determineRackType(devices);

  const { container, position } = toPath
    ? resolveInsertionPath(toPath)
    : getDeviceInsertionPoint(devices[0]);

  if (!container || !container.exists()) {
    throw new Error(`wrapInRack: target container does not exist`);
  }

  const rackName = RACK_TYPE_TO_DEVICE_NAME[rackType];
  const rackId = container.call("insert_device", rackName, position ?? 0);
  const rack = LiveAPI.from(rackId);

  if (name) {
    rack.set("name", name);
  }

  const liveSet = new LiveAPI("live_set");

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];

    // Ensure chain exists (create if needed)
    while (i >= rack.getChildren("chains").length) {
      rack.call("insert_chain");
    }

    const chainPath = `${rack.path} chains ${i}`;
    const chainContainer = new LiveAPI(chainPath);
    const deviceId = device.id.startsWith("id ")
      ? device.id
      : `id ${device.id}`;
    const chainId = chainContainer.id.startsWith("id ")
      ? chainContainer.id
      : `id ${chainContainer.id}`;

    liveSet.call("move_device", deviceId, chainId, 0);
  }

  return { id: rack.id, type: rackType, deviceCount: devices.length };
}

function resolveDevices(items, isIdBased) {
  const devices = [];

  for (const item of items) {
    const device = isIdBased ? LiveAPI.from(item) : resolveDeviceFromPath(item);

    if (device && device.exists()) {
      const type = device.type;

      if (type.endsWith("Device")) {
        devices.push(device);
      } else {
        console.error(`wrapInRack: "${item}" is not a device (type: ${type})`);
      }
    } else {
      console.error(`wrapInRack: device not found at "${item}"`);
    }
  }

  return devices;
}

function resolveDeviceFromPath(path) {
  const resolved = resolveInsertionPath(path);

  if (!resolved.container) {
    return null;
  }

  if (resolved.position != null) {
    const devicePath = `${resolved.container.path} devices ${resolved.position}`;

    return new LiveAPI(devicePath);
  }

  return resolved.container;
}

function determineRackType(devices) {
  const types = new Set();

  for (const device of devices) {
    const deviceType = device.getProperty("type");

    types.add(deviceType);
  }

  if (types.has(LIVE_API_DEVICE_TYPE_INSTRUMENT)) {
    throw new Error("wrapInRack: instruments not supported yet (Phase 2)");
  }

  if (
    types.has(LIVE_API_DEVICE_TYPE_AUDIO_EFFECT) &&
    types.has(LIVE_API_DEVICE_TYPE_MIDI_EFFECT)
  ) {
    throw new Error(
      "wrapInRack: cannot mix MIDI and Audio effects in one rack",
    );
  }

  if (types.has(LIVE_API_DEVICE_TYPE_AUDIO_EFFECT)) {
    return "audio-effect-rack";
  }

  if (types.has(LIVE_API_DEVICE_TYPE_MIDI_EFFECT)) {
    return "midi-effect-rack";
  }

  throw new Error("wrapInRack: no valid effect devices found");
}

function getDeviceInsertionPoint(device) {
  const parentPath = device.path.replace(/ devices \d+$/, "");
  const container = new LiveAPI(parentPath);
  const match = device.path.match(/ devices (\d+)$/);
  const position = match ? parseInt(match[1], 10) : 0;

  return { container, position };
}
