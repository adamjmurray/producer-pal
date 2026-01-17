import * as console from "#src/shared/v8-max-console.js";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.js";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/path/device-path-helpers.js";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.js";

const RACK_TYPE_INSTRUMENT = "instrument-rack";

const RACK_TYPE_TO_DEVICE_NAME = {
  "audio-effect-rack": "Audio Effect Rack",
  "midi-effect-rack": "MIDI Effect Rack",
  [RACK_TYPE_INSTRUMENT]: "Instrument Rack",
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
    console.error("Warning: wrapInRack: no devices found");

    return null;
  }

  const rackType = determineRackType(devices);

  if (rackType == null) {
    return null;
  }

  // Instruments require temp-track workaround
  if (rackType === RACK_TYPE_INSTRUMENT) {
    return wrapInstrumentsInRack(devices, toPath, name);
  }

  const { container, position } = toPath
    ? resolveInsertionPath(toPath)
    : getDeviceInsertionPoint(devices[0]);

  if (!container || !container.exists()) {
    console.error("Warning: wrapInRack: target container does not exist");

    return null;
  }

  const rackName = RACK_TYPE_TO_DEVICE_NAME[rackType];
  const rackId = container.call("insert_device", rackName, position ?? 0);
  const rack = LiveAPI.from(rackId);

  if (name) {
    rack.set("name", name);
  }

  const liveSet = LiveAPI.from("live_set");

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];

    // Ensure chain exists (create if needed)
    const currentChainCount = rack.getChildren("chains").length;

    if (i >= currentChainCount) {
      const chainsNeeded = i + 1 - currentChainCount;

      for (let j = 0; j < chainsNeeded; j++) {
        const result = rack.call("insert_chain");

        if (!Array.isArray(result) || result[0] !== "id") {
          console.error(
            `Warning: wrapInRack: failed to create chain ${j + 1}/${chainsNeeded}`,
          );
        }
      }
    }

    const chainPath = `${rack.path} chains ${i}`;
    const chainContainer = LiveAPI.from(chainPath);
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

    return LiveAPI.from(devicePath);
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
    return RACK_TYPE_INSTRUMENT;
  }

  if (
    types.has(LIVE_API_DEVICE_TYPE_AUDIO_EFFECT) &&
    types.has(LIVE_API_DEVICE_TYPE_MIDI_EFFECT)
  ) {
    console.error(
      "Warning: wrapInRack: cannot mix MIDI and Audio effects in one rack",
    );

    return null;
  }

  if (types.has(LIVE_API_DEVICE_TYPE_AUDIO_EFFECT)) {
    return "audio-effect-rack";
  }

  if (types.has(LIVE_API_DEVICE_TYPE_MIDI_EFFECT)) {
    return "midi-effect-rack";
  }

  console.error("Warning: wrapInRack: no valid effect devices found");

  return null;
}

function getDeviceInsertionPoint(device) {
  const parentPath = device.path.replace(/ devices \d+$/, "");
  const container = LiveAPI.from(parentPath);
  const match = device.path.match(/ devices (\d+)$/);
  const position = match ? Number.parseInt(match[1]) : 0;

  return { container, position };
}

/**
 * Wrap instrument(s) in an Instrument Rack using temp-track workaround.
 * Live doesn't allow creating Instrument Rack on track with existing instrument.
 * @param {object[]} devices - Instrument device(s) to wrap
 * @param {string} [toPath] - Target path for the new rack
 * @param {string} [name] - Name for the new rack
 * @returns {object} Info about the created rack
 */
function wrapInstrumentsInRack(devices, toPath, name) {
  const liveSet = LiveAPI.from("live_set");
  const firstDevice = devices[0];

  // 1. Get source track from first instrument
  const { container: sourceContainer, position: devicePosition } =
    getDeviceInsertionPoint(firstDevice);

  // 2. Create temp MIDI track (appended)
  const tempTrackId = liveSet.call("create_midi_track", -1);
  const tempTrack = LiveAPI.from(tempTrackId);
  const tempTrackIndex = tempTrack.trackIndex;

  try {
    // 3. Move ALL instruments to temp track
    const tempTrackIdForMove = formatId(tempTrack.id);

    for (const device of devices) {
      liveSet.call("move_device", formatId(device.id), tempTrackIdForMove, 0);
    }

    // 4. Create Instrument Rack on source track (or toPath)
    const { container, position } = toPath
      ? resolveInsertionPath(toPath)
      : { container: sourceContainer, position: devicePosition };

    const rackId = container.call(
      "insert_device",
      "Instrument Rack",
      position ?? 0,
    );
    const rack = LiveAPI.from(rackId);

    if (name) {
      rack.set("name", name);
    }

    // 5. Move each instrument from temp into rack's chains
    // Instruments are now at devices 0, 1, 2... on temp track (in reverse order)
    // We need to process them in reverse to maintain original order
    for (let i = devices.length - 1; i >= 0; i--) {
      // Create chain
      rack.call("insert_chain");
      const chainIndex = rack.getChildren("chains").length - 1;
      const chain = LiveAPI.from(`${rack.path} chains ${chainIndex}`);

      // Get device at position 0 (always 0 since we move from front)
      const tempDevice = LiveAPI.from(`${tempTrack.path} devices 0`);

      liveSet.call(
        "move_device",
        formatId(tempDevice.id),
        formatId(chain.id),
        0,
      );
    }

    // 6. Delete temp track
    liveSet.call("delete_track", tempTrackIndex);

    return {
      id: rack.id,
      type: RACK_TYPE_INSTRUMENT,
      deviceCount: devices.length,
    };
  } catch (error) {
    // Cleanup: delete temp track if it still exists
    try {
      liveSet.call("delete_track", tempTrackIndex);
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  }
}

function formatId(id) {
  return id.startsWith("id ") ? id : `id ${id}`;
}
