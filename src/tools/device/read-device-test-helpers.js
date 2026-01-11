import { liveApiGet, liveApiId, liveApiType } from "#src/test/mock-live-api.js";

// Helper functions for mock property lookup
const getPadProperty = (id, prop, padProperties) => {
  const padProps = padProperties[id] ?? {};
  const propMap = {
    note: [padProps.note ?? 36],
    name: [padProps.name ?? "Kick"],
    mute: [padProps.mute ?? 0],
    solo: [padProps.solo ?? 0],
    chains: (padProps.chainIds ?? []).flatMap((c) => ["id", c]),
  };

  return propMap[prop];
};

const getChainProperty = (id, prop, chainProperties) => {
  const chainProps = chainProperties[id] ?? {};
  const propMap = {
    name: [chainProps.name ?? "Chain"],
    mute: [chainProps.mute ?? 0],
    solo: [chainProps.solo ?? 0],
    muted_via_solo: [0],
    choke_group: [chainProps.choke_group ?? 0],
    out_note: [chainProps.out_note ?? 36],
    color: chainProps.color ? [chainProps.color] : [],
    devices: (chainProps.deviceIds ?? []).flatMap((d) => ["id", d]),
  };

  return propMap[prop];
};

const getDeviceProperty = (id, prop, deviceProperties) => {
  const devProps = deviceProperties[id] ?? {};
  const propMap = {
    name: [devProps.name ?? "Device"],
    class_display_name: [devProps.class_display_name ?? "Device"],
    type: [devProps.type ?? 1],
    can_have_chains: [0],
    can_have_drum_pads: [0],
    is_active: [1],
    devices: [],
  };

  return propMap[prop];
};

/**
 * Helper to set up drum pad mocks using the LiveAPI ID-based pattern
 * @param {object} config - Configuration for the mocks
 * @param {string} [config.deviceId] - Device ID (default: "drum-rack-1")
 * @param {string[]} [config.padIds] - Pad IDs (default: ["pad-36"])
 * @param {object} [config.padProperties] - Pad properties by ID
 * @param {object} [config.chainProperties] - Chain properties by ID
 * @param {object} [config.deviceProperties] - Device properties by ID
 */
export function setupDrumPadMocks(config) {
  const {
    deviceId = "drum-rack-1",
    padIds = ["pad-36"],
    padProperties = {},
    chainProperties = {},
    deviceProperties = {},
  } = config;

  liveApiId.mockImplementation(function () {
    if (this._path === "live_set tracks 1 devices 0") return deviceId;

    return this._id ?? "0";
  });

  // Mock chain type - chains in drum pads are DrumChain type
  liveApiType.mockImplementation(function () {
    const id = this._id ?? this.id;

    if (id?.startsWith("chain-")) {
      return chainProperties[id]?.type ?? "DrumChain";
    }

    // Let default mock handle other types
  });

  liveApiGet.mockImplementation(function (prop) {
    const id = this._id ?? this.id;

    if (id === deviceId || this._path?.includes("devices 0")) {
      if (prop === "can_have_drum_pads") return [1];
      if (prop === "drum_pads") return padIds.flatMap((p) => ["id", p]);
    }

    if (id?.startsWith("pad-")) return getPadProperty(id, prop, padProperties);
    if (id?.startsWith("chain-"))
      return getChainProperty(id, prop, chainProperties);
    if (id?.startsWith("device-"))
      return getDeviceProperty(id, prop, deviceProperties);

    return [];
  });
}
