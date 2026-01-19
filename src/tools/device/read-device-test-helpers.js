import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

/**
 * @typedef {object} PadProps
 * @property {number} [note] - Note number
 * @property {string} [name] - Pad name
 * @property {number} [mute] - Muted state
 * @property {number} [solo] - Solo state
 * @property {string[]} [chainIds] - Chain IDs
 */

/**
 * @typedef {object} ChainProps
 * @property {string} [name] - Chain name
 * @property {number} [mute] - Muted state
 * @property {number} [solo] - Solo state
 * @property {number} [choke_group] - Choke group
 * @property {number} [out_note] - Output note
 * @property {number} [color] - Color value
 * @property {string[]} [deviceIds] - Device IDs
 * @property {string} [type] - Chain type (e.g., "DrumChain")
 */

/**
 * @typedef {object} DeviceProps
 * @property {string} [name] - Device name
 * @property {string} [class_display_name] - Display name
 * @property {number} [type] - Device type
 */

/**
 * Get pad property from mock map
 * @param {string} id - Pad ID
 * @param {string} prop - Property name
 * @param {Record<string, PadProps>} padProperties - Pad properties by ID
 * @returns {unknown[] | undefined} - Property value
 */
const getPadProperty = (id, prop, padProperties) => {
  const padProps = padProperties[id] ?? {};
  /** @type {Record<string, unknown[]>} */
  const propMap = {
    note: [padProps.note ?? 36],
    name: [padProps.name ?? "Kick"],
    mute: [padProps.mute ?? 0],
    solo: [padProps.solo ?? 0],
    chains: (padProps.chainIds ?? []).flatMap((c) => ["id", c]),
  };

  return propMap[prop];
};

/**
 * Get chain property from mock map
 * @param {string} id - Chain ID
 * @param {string} prop - Property name
 * @param {Record<string, ChainProps>} chainProperties - Chain properties by ID
 * @returns {unknown[] | undefined} - Property value
 */
const getChainProperty = (id, prop, chainProperties) => {
  const chainProps = chainProperties[id] ?? {};
  /** @type {Record<string, unknown[]>} */
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

/**
 * Get device property from mock map
 * @param {string} id - Device ID
 * @param {string} prop - Property name
 * @param {Record<string, DeviceProps>} deviceProperties - Device properties by ID
 * @returns {unknown[] | undefined} - Property value
 */
const getDeviceProperty = (id, prop, deviceProperties) => {
  const devProps = deviceProperties[id] ?? {};
  /** @type {Record<string, unknown[]>} */
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
 * @param {Record<string, PadProps>} [config.padProperties] - Pad properties by ID
 * @param {Record<string, ChainProps>} [config.chainProperties] - Chain properties by ID
 * @param {Record<string, DeviceProps>} [config.deviceProperties] - Device properties by ID
 */
export function setupDrumPadMocks(config) {
  const {
    deviceId = "drum-rack-1",
    padIds = ["pad-36"],
    padProperties = {},
    chainProperties = {},
    deviceProperties = {},
  } = config;

  liveApiId.mockImplementation(
    /**
     * @this {{_path?: string, _id?: string}}
     * @returns {string} The mock ID
     */
    function () {
      if (this._path === "live_set tracks 1 devices 0") return deviceId;

      return this._id ?? "0";
    },
  );

  // Mock chain type - chains in drum pads are DrumChain type
  liveApiType.mockImplementation(
    /**
     * @this {{_id?: string, id?: string}}
     * @returns {string | undefined} The mock type
     */
    function () {
      const id = this._id ?? this.id;

      if (id?.startsWith("chain-")) {
        return chainProperties[id]?.type ?? "DrumChain";
      }

      // Let default mock handle other types
    },
  );

  liveApiGet.mockImplementation(
    /**
     * @this {{_id?: string, id?: string, _path?: string}}
     * @param {string} prop - The property name
     * @returns {unknown[]} The mock property value
     */
    function (prop) {
      const id = this._id ?? this.id;

      if (id === deviceId || this._path?.includes("devices 0")) {
        if (prop === "can_have_drum_pads") return [1];
        if (prop === "drum_pads") return padIds.flatMap((p) => ["id", p]);
      }

      if (id?.startsWith("pad-"))
        return getPadProperty(id, prop, padProperties) ?? [];
      if (id?.startsWith("chain-"))
        return getChainProperty(id, prop, chainProperties) ?? [];
      if (id?.startsWith("device-"))
        return getDeviceProperty(id, prop, deviceProperties) ?? [];

      return [];
    },
  );
}

// Mock path constants for param tests
const DEVICE_PATH = "id device-123";
const PARAM_PATH = "id param-1";

// Default device properties for Operator instrument
const DEFAULT_DEVICE_PROPS = {
  name: "Operator",
  class_display_name: "Operator",
  type: 1,
  can_have_chains: 0,
  can_have_drum_pads: 0,
  is_active: 1,
};

// Default parameter properties for numeric params
const DEFAULT_PARAM_PROPS = {
  name: "Volume",
  original_name: "Volume",
  value: 0.5,
  state: 0,
  is_enabled: 1,
  automation_state: 0,
  min: 0,
  max: 1,
  is_quantized: 0,
  default_value: 0.7,
  display_value: -6,
};

/**
 * @typedef {object} DeviceParamConfig
 * @property {Partial<typeof DEFAULT_DEVICE_PROPS>} [device] - Device properties (merged with defaults)
 * @property {Partial<typeof DEFAULT_PARAM_PROPS> & {value_items?: unknown[]}} [param] - Param properties
 * @property {(value: unknown) => unknown} [strForValue] - Custom str_for_value handler
 */

/**
 * Setup mocks for device parameter tests.
 * @param {DeviceParamConfig} [config] - Configuration for the mocks
 */
export function setupDeviceParamMocks(config = {}) {
  const { device = {}, param = {}, strForValue } = config;
  /** @type {Record<string, unknown>} */
  const deviceProps = { ...DEFAULT_DEVICE_PROPS, ...device };
  /** @type {Record<string, unknown>} */
  const paramProps = { ...DEFAULT_PARAM_PROPS, ...param };

  liveApiId.mockImplementation(
    /**
     * @this {{_path?: string}}
     * @returns {string} The mock ID
     */
    function () {
      if (this._path === DEVICE_PATH) return "device-123";
      if (this._path === PARAM_PATH) return "param-1";

      return "0";
    },
  );

  liveApiGet.mockImplementation(
    /**
     * @this {{_path?: string}}
     * @param {string} prop - The property name
     * @returns {unknown[]} The mock property value
     */
    function (prop) {
      if (this._path === DEVICE_PATH) {
        if (prop === "parameters") return ["id", "param-1"];

        return deviceProps[prop] != null ? [deviceProps[prop]] : [];
      }

      if (this._path === PARAM_PATH) {
        if (prop === "value_items" && paramProps.value_items) {
          return /** @type {unknown[]} */ (paramProps.value_items);
        }

        return paramProps[prop] != null ? [paramProps[prop]] : [];
      }

      return [];
    },
  );

  if (strForValue) {
    liveApiCall.mockImplementation(
      /**
       * @this {{_path?: string}}
       * @param {string} method - The method name
       * @param {unknown} value - The value argument
       * @returns {unknown} The mock result
       */
      function (method, value) {
        if (this._path === PARAM_PATH && method === "str_for_value") {
          return strForValue(value);
        }

        return [];
      },
    );
  }
}

/**
 * @typedef {object} BasicDeviceConfig
 * @property {string} [id] - Device ID (default: "device-123")
 * @property {string} [name] - Device name (default: same as class_display_name)
 * @property {string} [class_display_name] - Class display name (default: "Operator")
 * @property {number} [type] - Device type: 1=instrument, 2=audio effect, 4=midi effect
 * @property {number} [can_have_chains] - Whether device can have chains (0 or 1)
 * @property {number} [can_have_drum_pads] - Whether device can have drum pads (0 or 1)
 * @property {number} [is_active] - Whether device is active (0=deactivated, 1=active)
 * @property {number} [is_collapsed] - Whether device view is collapsed (0 or 1)
 * @property {string} [sample] - Sample file path for Simpler devices
 * @property {string[]} [chainIds] - Chain IDs for rack devices
 */

/**
 * Setup mocks for basic device tests. Reduces boilerplate for simple device property tests.
 * @param {BasicDeviceConfig} [config] - Device configuration
 */
export function setupBasicDeviceMock(config = {}) {
  const {
    id = "device-123",
    name,
    class_display_name = "Operator",
    type = 1,
    can_have_chains = 0,
    can_have_drum_pads = 0,
    is_active = 1,
    is_collapsed,
    sample,
    chainIds = [],
  } = config;

  const deviceName = name ?? class_display_name;
  const hasView = is_collapsed !== undefined;
  const hasSample = sample !== undefined;

  liveApiId.mockImplementation(
    /**
     * @this {{_path?: string}}
     * @returns {string} The mock ID
     */
    function () {
      if (this._path === `id ${id}`) return id;
      if (hasView && this._path === `id ${id} view`) return `view-${id}`;
      if (hasSample && this._path === "id sample-obj") return "sample-obj";

      return id;
    },
  );

  liveApiGet.mockImplementation(
    /**
     * @this {{_path?: string}}
     * @param {string} prop - The property name
     * @returns {unknown[]} The mock property value
     */
    function (prop) {
      // Handle view properties for collapsed state
      if (hasView && this._path === `id ${id} view`) {
        if (prop === "is_collapsed") return [is_collapsed];

        return [];
      }

      // Handle sample properties for Simpler
      if (hasSample && this._path === "id sample-obj") {
        if (prop === "file_path") return [sample];

        return [];
      }

      // Handle device properties
      switch (prop) {
        case "name":
          return [deviceName];
        case "class_display_name":
          return [class_display_name];
        case "type":
          return [type];
        case "can_have_chains":
          return [can_have_chains];
        case "can_have_drum_pads":
          return [can_have_drum_pads];
        case "is_active":
          return [is_active];
        case "sample":
          return hasSample ? ["id", "sample-obj"] : [];
        case "parameters":
          return [];
        default:
          return [];
      }
    },
  );

  // Mock getChildren for rack devices
  if (can_have_chains === 1 || chainIds.length > 0) {
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "getChildren") {
        const childType = args[0];

        if (childType === "chains" || childType === "return_chains") {
          return chainIds.flatMap((c) => ["id", c]);
        }

        if (childType === "drum_pads") return [];
      }

      return [];
    });
  }
}

/**
 * @typedef {object} ChainMockConfig
 * @property {string} [id] - Chain ID (default: "chain-123")
 * @property {string} [name] - Chain name
 * @property {number} [mute] - Muted state (0 or 1)
 * @property {number} [solo] - Solo state (0 or 1)
 * @property {number} [color] - Color value (number, e.g. 0xFF5500)
 * @property {string[]} [deviceIds] - Device IDs in the chain
 */

/**
 * Setup mocks for chain reading tests. Reduces boilerplate for chain property tests.
 * @param {ChainMockConfig} [config] - Chain configuration
 */
export function setupChainMock(config = {}) {
  const {
    id = "chain-123",
    name = "Chain",
    mute = 0,
    solo = 0,
    color,
    deviceIds = [],
  } = config;

  liveApiId.mockReturnValue(id);
  liveApiType.mockReturnValue("Chain");

  liveApiGet.mockImplementation(
    /**
     * @param {string} prop - The property name
     * @returns {unknown[]} The mock property value
     */
    function (prop) {
      switch (prop) {
        case "name":
          return [name];
        case "mute":
          return [mute];
        case "solo":
          return [solo];
        case "color":
          return color !== undefined ? [color] : [];
        case "devices":
          return deviceIds.flatMap((d) => ["id", d]);
        default:
          return [];
      }
    },
  );

  liveApiCall.mockImplementation(function (method, ...args) {
    if (method === "getChildren" && args[0] === "devices") {
      return deviceIds.flatMap((d) => ["id", d]);
    }

    return [];
  });
}
