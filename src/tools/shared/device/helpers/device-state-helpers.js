import { DEVICE_TYPE, STATE } from "#src/tools/constants.js";

/**
 * Build chain info object with standard properties
 * @param {object} chain - Chain Live API object
 * @param {object} options - Build options
 * @param {string} [options.path] - Optional simplified path
 * @param {Array} [options.devices] - Pre-processed devices array (skips device fetching)
 * @param {boolean} [options.isDrumPadChain] - True if this chain is inside a drum pad (has choke_group)
 * @returns {object} Chain info object with id, path, name, color, chokeGroup, state
 */
export function buildChainInfo(chain, options = {}) {
  const { path, devices, isDrumPadChain = false } = options;

  const chainInfo = {
    id: chain.id,
    ...(path && { path }),
    name: chain.getProperty("name"),
  };

  const color = chain.getColor();

  if (color) {
    chainInfo.color = color;
  }

  // choke_group only exists on drum pad chains
  if (isDrumPadChain) {
    const chokeGroup = chain.getProperty("choke_group");

    if (chokeGroup > 0) {
      chainInfo.chokeGroup = chokeGroup;
    }
  }

  const chainState = computeState(chain);

  if (chainState !== STATE.ACTIVE) {
    chainInfo.state = chainState;
  }

  if (devices !== undefined) {
    chainInfo.devices = devices;
  }

  return chainInfo;
}

/**
 * Compute the state of a Live object based on mute/solo properties
 * @param {object} liveObject - Live API object
 * @param {string} category - Category type (default "regular")
 * @returns {string} State value
 */
export function computeState(liveObject, category = "regular") {
  if (category === "master") {
    return STATE.ACTIVE;
  }

  const isMuted = liveObject.getProperty("mute") > 0;
  const isSoloed = liveObject.getProperty("solo") > 0;
  const isMutedViaSolo = liveObject.getProperty("muted_via_solo") > 0;

  if (isSoloed) {
    return STATE.SOLOED;
  }

  if (isMuted && isMutedViaSolo) {
    return STATE.MUTED_ALSO_VIA_SOLO;
  }

  if (isMutedViaSolo) {
    return STATE.MUTED_VIA_SOLO;
  }

  if (isMuted) {
    return STATE.MUTED;
  }

  return STATE.ACTIVE;
}

/**
 * Check if device is an instrument type
 * @param {string} deviceType - Device type string
 * @returns {boolean} True if device is an instrument
 */
export function isInstrumentDevice(deviceType) {
  return (
    deviceType.startsWith(DEVICE_TYPE.INSTRUMENT) ||
    deviceType.startsWith(DEVICE_TYPE.INSTRUMENT_RACK) ||
    deviceType.startsWith(DEVICE_TYPE.DRUM_RACK)
  );
}

/**
 * Check if any device in the list is an instrument
 * @param {Array} devices - Array of device objects
 * @returns {boolean} True if any instrument found
 */
export function hasInstrumentInDevices(devices) {
  if (!devices || devices.length === 0) {
    return false;
  }

  for (const device of devices) {
    if (isInstrumentDevice(device.type)) {
      return true;
    }

    if (device.chains) {
      for (const chain of device.chains) {
        if (chain.devices && hasInstrumentInDevices(chain.devices)) {
          return true;
        }
      }
    }
  }

  return false;
}
