import {
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mock-live-api.js";

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

    if (this._path?.includes("devices")) {
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
