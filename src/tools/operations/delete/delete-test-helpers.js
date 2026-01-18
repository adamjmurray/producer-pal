import {
  children,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

/**
 * Setup mocks for device deletion tests
 * @param {string|string[]} deviceIds - Device ID(s) to mock
 * @param {string|object} pathOrMap - Path string for single device, or ID-to-path mapping for multiple
 * @param {string} [type="Device"] - Live API type to return
 */
export function setupDeviceMocks(deviceIds, pathOrMap, type = "Device") {
  const ids = Array.isArray(deviceIds) ? deviceIds : [deviceIds];
  const pathMap =
    typeof pathOrMap === "string" ? { [ids[0]]: pathOrMap } : pathOrMap;

  liveApiId.mockImplementation(function () {
    if (this._path?.startsWith("live_set ") && this._path.includes("devices")) {
      // Path-based lookup returns the device ID
      for (const [id, path] of Object.entries(pathMap)) {
        if (this._path === path) {
          return id;
        }
      }
    }

    return this._id;
  });

  liveApiPath.mockImplementation(function () {
    if (pathMap[this._id]) {
      return pathMap[this._id];
    }

    return this._path;
  });

  liveApiType.mockImplementation(function () {
    if (ids.includes(this._id)) {
      return type;
    }

    // Only return type for known paths in the map
    const knownPaths = Object.values(pathMap);

    if (this._path && knownPaths.includes(this._path)) {
      return type;
    }
  });
}

/**
 * Setup mocks for drum pad deletion tests
 * @param {string|string[]} padIds - Drum pad ID(s) to mock
 * @param {string|object} pathOrMap - Path string for single pad, or ID-to-path mapping for multiple
 */
export function setupDrumPadMocks(padIds, pathOrMap) {
  setupDeviceMocks(padIds, pathOrMap, "DrumPad");
}

/**
 * Setup mocks for drum chain deletion tests (path-based drum pad deletion)
 * @param {object} config - Configuration object
 * @param {string} config.devicePath - Path to the drum rack device
 * @param {string} config.chainPath - Path to the chain
 * @param {string} config.drumRackId - ID for the drum rack
 * @param {string} config.chainId - ID for the chain
 * @param {number} [config.inNote=36] - MIDI note for the chain (default C1=36)
 * @param {object} [config.extraPadPath] - Optional extra pad path mapping {padId: path}
 */
export function setupDrumChainMocks({
  devicePath,
  chainPath,
  drumRackId,
  chainId,
  inNote = 36,
  extraPadPath = null,
}) {
  liveApiId.mockImplementation(function () {
    if (this._path === devicePath) return drumRackId;
    if (this._path === `id ${chainId}`) return chainId;

    return this._id;
  });

  liveApiPath.mockImplementation(function () {
    const id = this._id ?? this.id;

    if (id === chainId) return chainPath;
    if (extraPadPath && extraPadPath[id]) return extraPadPath[id];

    return this._path;
  });

  liveApiType.mockImplementation(function () {
    const id = this._id ?? this.id;

    if (extraPadPath && extraPadPath[id]) return "DrumPad";
    if (id?.startsWith("chain-")) return "DrumChain";
    if (id === drumRackId || this._path === devicePath)
      return "DrumGroupDevice";
  });

  liveApiGet.mockImplementation(function (prop) {
    const id = this._id ?? this.id;

    if ((id === drumRackId || this._path === devicePath) && prop === "chains") {
      return children(chainId);
    }

    if (
      (id === drumRackId || this._path === devicePath) &&
      prop === "can_have_drum_pads"
    ) {
      return [1];
    }

    if (id?.startsWith("chain-") && prop === "in_note") {
      return [inNote];
    }

    return [0];
  });
}
