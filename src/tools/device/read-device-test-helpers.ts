// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiType,
} from "#src/test/mocks/mock-live-api.ts";

interface PadProps {
  note?: number;
  name?: string;
  mute?: number;
  solo?: number;
  chainIds?: string[];
}

interface ChainProps {
  name?: string;
  mute?: number;
  solo?: number;
  choke_group?: number;
  out_note?: number;
  color?: number;
  deviceIds?: string[];
  type?: string;
}

interface DeviceProps {
  name?: string;
  class_display_name?: string;
  type?: number;
}

/**
 * Get pad property from mock map
 * @param id - Pad ID
 * @param prop - Property name
 * @param padProperties - Pad properties by ID
 * @returns Property value
 */
const getPadProperty = (
  id: string,
  prop: string,
  padProperties: Record<string, PadProps>,
): unknown[] | undefined => {
  const padProps = padProperties[id] ?? {};
  const propMap: Record<string, unknown[]> = {
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
 * @param id - Chain ID
 * @param prop - Property name
 * @param chainProperties - Chain properties by ID
 * @returns Property value
 */
const getChainProperty = (
  id: string,
  prop: string,
  chainProperties: Record<string, ChainProps>,
): unknown[] | undefined => {
  const chainProps = chainProperties[id] ?? {};
  const propMap: Record<string, unknown[]> = {
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
 * @param id - Device ID
 * @param prop - Property name
 * @param deviceProperties - Device properties by ID
 * @returns Property value
 */
const getDeviceProperty = (
  id: string,
  prop: string,
  deviceProperties: Record<string, DeviceProps>,
): unknown[] | undefined => {
  const devProps = deviceProperties[id] ?? {};
  const propMap: Record<string, unknown[]> = {
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

interface DrumPadMockConfig {
  deviceId?: string;
  padIds?: string[];
  padProperties?: Record<string, PadProps>;
  chainProperties?: Record<string, ChainProps>;
  deviceProperties?: Record<string, DeviceProps>;
}

/**
 * Helper to set up drum pad mocks using the LiveAPI ID-based pattern
 * @param config - Configuration for the mocks
 * @param config.deviceId - Device ID (default: "drum-rack-1")
 * @param config.padIds - Pad IDs (default: ["pad-36"])
 * @param config.padProperties - Pad properties by ID
 * @param config.chainProperties - Chain properties by ID
 * @param config.deviceProperties - Device properties by ID
 */
export function setupDrumPadMocks(config: DrumPadMockConfig): void {
  const {
    deviceId = "drum-rack-1",
    padIds = ["pad-36"],
    padProperties = {},
    chainProperties = {},
    deviceProperties = {},
  } = config;

  liveApiId.mockImplementation(function (this: {
    _path?: string;
    _id?: string;
  }): string {
    if (this._path === "live_set tracks 1 devices 0") return deviceId;

    return this._id ?? "0";
  });

  // Mock chain type - chains in drum pads are DrumChain type
  liveApiType.mockImplementation(function (this: {
    _id?: string;
    id?: string;
  }): string | undefined {
    const id = this._id ?? this.id;

    if (id?.startsWith("chain-")) {
      return chainProperties[id]?.type ?? "DrumChain";
    }

    // Let default mock handle other types
    return undefined;
  });

  liveApiGet.mockImplementation(function (
    this: { _id?: string; id?: string; _path?: string },
    prop: string,
  ): unknown[] {
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
  });
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

interface DeviceParamConfig {
  device?: Partial<typeof DEFAULT_DEVICE_PROPS>;
  param?: Partial<typeof DEFAULT_PARAM_PROPS> & { value_items?: unknown[] };
  strForValue?: (value: unknown) => unknown;
}

/**
 * Setup mocks for device parameter tests.
 * @param config - Configuration for the mocks
 */
export function setupDeviceParamMocks(config: DeviceParamConfig = {}): void {
  const { device = {}, param = {}, strForValue } = config;
  const deviceProps: Record<string, unknown> = {
    ...DEFAULT_DEVICE_PROPS,
    ...device,
  };
  const paramProps: Record<string, unknown> = {
    ...DEFAULT_PARAM_PROPS,
    ...param,
  };

  liveApiId.mockImplementation(function (this: { _path?: string }): string {
    if (this._path === DEVICE_PATH) return "device-123";
    if (this._path === PARAM_PATH) return "param-1";

    return "0";
  });

  liveApiGet.mockImplementation(function (
    this: { _path?: string },
    prop: string,
  ): unknown[] {
    if (this._path === DEVICE_PATH) {
      if (prop === "parameters") return ["id", "param-1"];

      return deviceProps[prop] != null ? [deviceProps[prop]] : [];
    }

    if (this._path === PARAM_PATH) {
      if (prop === "value_items" && paramProps.value_items) {
        return paramProps.value_items as unknown[];
      }

      return paramProps[prop] != null ? [paramProps[prop]] : [];
    }

    return [];
  });

  if (strForValue) {
    liveApiCall.mockImplementation(function (
      this: { _path?: string },
      method: string,
      value: unknown,
    ): unknown {
      if (this._path === PARAM_PATH && method === "str_for_value") {
        return strForValue(value);
      }

      return [];
    });
  }
}

interface BasicDeviceConfig {
  id?: string;
  name?: string;
  class_display_name?: string;
  type?: number;
  can_have_chains?: number;
  can_have_drum_pads?: number;
  is_active?: number;
  is_collapsed?: number;
  sample?: string;
  chainIds?: string[];
}

/**
 * Setup mocks for basic device tests. Reduces boilerplate for simple device property tests.
 * @param config - Device configuration
 */
export function setupBasicDeviceMock(config: BasicDeviceConfig = {}): void {
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

  liveApiId.mockImplementation(function (this: { _path?: string }): string {
    if (this._path === `id ${id}`) return id;
    if (hasView && this._path === `id ${id} view`) return `view-${id}`;
    if (hasSample && this._path === "id sample-obj") return "sample-obj";

    return id;
  });

  liveApiGet.mockImplementation(function (
    this: { _path?: string },
    prop: string,
  ): unknown[] {
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
  });

  // Mock getChildren for rack devices
  if (can_have_chains === 1 || chainIds.length > 0) {
    liveApiCall.mockImplementation(function (
      method: string,
      ...args: unknown[]
    ) {
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

interface ChainMockConfig {
  id?: string;
  name?: string;
  mute?: number;
  solo?: number;
  color?: number;
  deviceIds?: string[];
}

/**
 * Setup mocks for chain reading tests. Reduces boilerplate for chain property tests.
 * @param config - Chain configuration
 */
export function setupChainMock(config: ChainMockConfig = {}): void {
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

  liveApiGet.mockImplementation(function (prop: string): unknown[] {
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
  });

  liveApiCall.mockImplementation(function (method: string, ...args: unknown[]) {
    if (method === "getChildren" && args[0] === "devices") {
      return deviceIds.flatMap((d) => ["id", d]);
    }

    return [];
  });
}
