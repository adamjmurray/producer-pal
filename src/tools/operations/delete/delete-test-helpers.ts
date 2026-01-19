import {
  children,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

interface MockContext {
  _path?: string;
  _id?: string;
  id?: string;
}

interface DrumChainConfig {
  devicePath: string;
  chainPath: string;
  drumRackId: string;
  chainId: string;
  inNote?: number;
  extraPadPath?: Record<string, string> | null;
}

/**
 * Generic setup for entity mocks (tracks, scenes, clips, etc.)
 * @param idToPathMap - Mapping of IDs to their paths
 * @param entityType - Live API type to return (e.g., "Track", "Scene")
 */
export function setupEntityMocks(
  idToPathMap: Record<string, string>,
  entityType: string,
): void {
  const pathToIdMap = Object.fromEntries(
    Object.entries(idToPathMap).map(([id, path]) => [path, id]),
  );

  liveApiId.mockImplementation(function (this: MockContext): string {
    if (this._path && pathToIdMap[this._path]) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test setup guarantees value exists after map lookup
      return pathToIdMap[this._path]!;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test mock always has _id set
    return this._id!;
  });

  liveApiPath.mockImplementation(function (this: MockContext) {
    if (this._id && idToPathMap[this._id]) {
      return idToPathMap[this._id];
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test mock always has _path set
    return this._path!;
  });

  liveApiType.mockImplementation(function (this: MockContext) {
    if (this._id && idToPathMap[this._id]) {
      return entityType;
    }
  });
}

/**
 * Setup mocks for track-related tests.
 * @param idToPathMap - Mapping of track IDs to their paths
 */
export function setupTrackMocks(idToPathMap: Record<string, string>): void {
  setupEntityMocks(idToPathMap, "Track");
}

/**
 * Setup mocks for scene-related tests.
 * @param idToPathMap - Mapping of scene IDs to their paths
 */
export function setupSceneMocks(idToPathMap: Record<string, string>): void {
  setupEntityMocks(idToPathMap, "Scene");
}

/**
 * Setup mocks for device deletion tests.
 * @param deviceIds - Device ID(s) to mock
 * @param pathOrMap - Path string for single device, or ID-to-path mapping for multiple
 * @param type - Live API type to return
 */
export function setupDeviceMocks(
  deviceIds: string | string[],
  pathOrMap: string | Record<string, string>,
  type: string = "Device",
): void {
  const ids = Array.isArray(deviceIds) ? deviceIds : [deviceIds];
  // ids always has at least one element since deviceIds is string | string[]
  const pathMap: Record<string, string> =
    typeof pathOrMap === "string"
      ? { [ids[0] as string]: pathOrMap }
      : pathOrMap;

  liveApiId.mockImplementation(function (this: MockContext) {
    if (this._path?.startsWith("live_set ") && this._path.includes("devices")) {
      // Path-based lookup returns the device ID
      for (const [id, path] of Object.entries(pathMap)) {
        if (this._path === path) {
          return id;
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test mock always has _id set
    return this._id!;
  });

  liveApiPath.mockImplementation(function (this: MockContext) {
    if (this._id && pathMap[this._id]) {
      return pathMap[this._id];
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test mock always has _path set
    return this._path!;
  });

  liveApiType.mockImplementation(function (this: MockContext) {
    if (this._id && ids.includes(this._id)) {
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
 * Setup mocks for drum pad deletion tests.
 * @param padIds - Drum pad ID(s) to mock
 * @param pathOrMap - Path string for single pad, or ID-to-path mapping for multiple
 */
export function setupDrumPadMocks(
  padIds: string | string[],
  pathOrMap: string | Record<string, string>,
): void {
  setupDeviceMocks(padIds, pathOrMap, "DrumPad");
}

/**
 * Setup mocks for drum chain deletion tests (path-based drum pad deletion).
 * @param config - Configuration object
 * @param config.devicePath - Path to the drum rack device
 * @param config.chainPath - Path to the chain
 * @param config.drumRackId - ID for the drum rack
 * @param config.chainId - ID for the chain
 * @param config.inNote - MIDI note for the chain (default C1=36)
 * @param config.extraPadPath - Optional extra pad path mapping
 */
export function setupDrumChainMocks({
  devicePath,
  chainPath,
  drumRackId,
  chainId,
  inNote = 36,
  extraPadPath = null,
}: DrumChainConfig): void {
  const extraPadPathTyped: Record<string, string> | null = extraPadPath;

  liveApiId.mockImplementation(function (this: MockContext) {
    if (this._path === devicePath) return drumRackId;
    if (this._path === `id ${chainId}`) return chainId;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test mock always has _id set
    return this._id!;
  });

  liveApiPath.mockImplementation(function (this: MockContext) {
    const id = this._id ?? this.id;

    if (id === chainId) return chainPath;
    if (id && extraPadPathTyped?.[id]) return extraPadPathTyped[id];

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test mock always has _path set
    return this._path!;
  });

  liveApiType.mockImplementation(function (this: MockContext) {
    const id = this._id ?? this.id;

    if (id && extraPadPathTyped?.[id]) return "DrumPad";
    if (id?.startsWith("chain-")) return "DrumChain";
    if (id === drumRackId || this._path === devicePath)
      return "DrumGroupDevice";
  });

  liveApiGet.mockImplementation(function (
    this: MockContext,
    prop: string,
  ): unknown[] {
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
