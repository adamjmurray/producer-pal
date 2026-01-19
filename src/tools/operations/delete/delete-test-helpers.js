import {
  children,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

/**
 * @typedef {object} MockContext
 * @property {string} [_path] - Live API path
 * @property {string} [_id] - Live API ID
 * @property {string} [id] - Alternate ID property
 */

/**
 * Generic setup for entity mocks (tracks, scenes, clips, etc.)
 * @param {Record<string, string>} idToPathMap - Mapping of IDs to their paths
 * @param {string} entityType - Live API type to return (e.g., "Track", "Scene")
 * @returns {void}
 */
export function setupEntityMocks(idToPathMap, entityType) {
  const pathToIdMap = Object.fromEntries(
    Object.entries(idToPathMap).map(([id, path]) => [path, id]),
  );

  liveApiId.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      if (this._path && pathToIdMap[this._path]) {
        return pathToIdMap[this._path];
      }

      return this._id;
    },
  );

  liveApiPath.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      if (this._id && idToPathMap[this._id]) {
        return idToPathMap[this._id];
      }

      return this._path;
    },
  );

  liveApiType.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      if (this._id && idToPathMap[this._id]) {
        return entityType;
      }
    },
  );
}

/**
 * Setup mocks for track-related tests.
 * @param {Record<string, string>} idToPathMap - Mapping of track IDs to their paths
 * @returns {void}
 */
export function setupTrackMocks(idToPathMap) {
  setupEntityMocks(idToPathMap, "Track");
}

/**
 * Setup mocks for scene-related tests.
 * @param {Record<string, string>} idToPathMap - Mapping of scene IDs to their paths
 * @returns {void}
 */
export function setupSceneMocks(idToPathMap) {
  setupEntityMocks(idToPathMap, "Scene");
}

/**
 * Setup mocks for device deletion tests.
 * @param {string|string[]} deviceIds - Device ID(s) to mock
 * @param {string|Record<string, string>} pathOrMap - Path string for single device, or ID-to-path mapping for multiple
 * @param {string} [type="Device"] - Live API type to return
 * @returns {void}
 */
export function setupDeviceMocks(deviceIds, pathOrMap, type = "Device") {
  const ids = Array.isArray(deviceIds) ? deviceIds : [deviceIds];
  /** @type {Record<string, string>} */
  const pathMap =
    typeof pathOrMap === "string"
      ? { [ids[0]]: pathOrMap }
      : /** @type {Record<string, string>} */ (pathOrMap);

  liveApiId.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      if (
        this._path?.startsWith("live_set ") &&
        this._path.includes("devices")
      ) {
        // Path-based lookup returns the device ID
        for (const [id, path] of Object.entries(pathMap)) {
          if (this._path === path) {
            return id;
          }
        }
      }

      return this._id;
    },
  );

  liveApiPath.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      if (this._id && pathMap[this._id]) {
        return pathMap[this._id];
      }

      return this._path;
    },
  );

  liveApiType.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      if (this._id && ids.includes(this._id)) {
        return type;
      }

      // Only return type for known paths in the map
      const knownPaths = Object.values(pathMap);

      if (this._path && knownPaths.includes(this._path)) {
        return type;
      }
    },
  );
}

/**
 * Setup mocks for drum pad deletion tests.
 * @param {string|string[]} padIds - Drum pad ID(s) to mock
 * @param {string|Record<string, string>} pathOrMap - Path string for single pad, or ID-to-path mapping for multiple
 * @returns {void}
 */
export function setupDrumPadMocks(padIds, pathOrMap) {
  setupDeviceMocks(padIds, pathOrMap, "DrumPad");
}

/**
 * Setup mocks for drum chain deletion tests (path-based drum pad deletion).
 * @param {object} config - Configuration object
 * @param {string} config.devicePath - Path to the drum rack device
 * @param {string} config.chainPath - Path to the chain
 * @param {string} config.drumRackId - ID for the drum rack
 * @param {string} config.chainId - ID for the chain
 * @param {number} [config.inNote=36] - MIDI note for the chain (default C1=36)
 * @param {Record<string, string>|null} [config.extraPadPath] - Optional extra pad path mapping {padId: path}
 * @returns {void}
 */
export function setupDrumChainMocks({
  devicePath,
  chainPath,
  drumRackId,
  chainId,
  inNote = 36,
  extraPadPath = null,
}) {
  /** @type {Record<string, string> | null} */
  const extraPadPathTyped = extraPadPath;

  liveApiId.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      if (this._path === devicePath) return drumRackId;
      if (this._path === `id ${chainId}`) return chainId;

      return this._id;
    },
  );

  liveApiPath.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      const id = this._id ?? this.id;

      if (id === chainId) return chainPath;
      if (id && extraPadPathTyped && extraPadPathTyped[id])
        return extraPadPathTyped[id];

      return this._path;
    },
  );

  liveApiType.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      const id = this._id ?? this.id;

      if (id && extraPadPathTyped && extraPadPathTyped[id]) return "DrumPad";
      if (id?.startsWith("chain-")) return "DrumChain";
      if (id === drumRackId || this._path === devicePath)
        return "DrumGroupDevice";
    },
  );

  liveApiGet.mockImplementation(
    /**
     * @this {MockContext}
     * @param {string} prop - Property name
     * @returns {unknown[]} Mock property value array
     */
    function (prop) {
      const id = this._id ?? this.id;

      if (
        (id === drumRackId || this._path === devicePath) &&
        prop === "chains"
      ) {
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
    },
  );
}
