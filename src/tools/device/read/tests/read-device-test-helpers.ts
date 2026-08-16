// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

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
 * @returns Registered mock objects for device and parameter
 */
export function setupDeviceParamMocks(config: DeviceParamConfig = {}): {
  device: RegisteredMockObject;
  param: RegisteredMockObject;
} {
  const { device = {}, param = {}, strForValue } = config;
  const deviceProps: Record<string, unknown> = {
    ...DEFAULT_DEVICE_PROPS,
    ...device,
  };
  const paramProps: Record<string, unknown> = {
    ...DEFAULT_PARAM_PROPS,
    ...param,
  };

  const deviceId = "device-123";
  const paramId = "param-1";
  const deviceIdPath = `id ${deviceId}`;
  const paramIdPath = `id ${paramId}`;

  // Register the device
  const deviceMock = registerMockObject(deviceId, {
    path: deviceIdPath,
    type: "Device",
    properties: {
      ...deviceProps,
      parameters: ["id", paramId],
    },
  });

  // Register the parameter
  const paramMock = registerMockObject(paramId, {
    path: paramIdPath,
    type: "DeviceParameter",
    properties: {
      ...paramProps,
    },
    // Add str_for_value method if provided
    methods: strForValue
      ? {
          str_for_value: (value: unknown) => strForValue(value),
        }
      : {},
  });

  return {
    device: deviceMock,
    param: paramMock,
  };
}

interface BasicDeviceConfig {
  id?: string;
  path?: string;
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
 * @returns Registered mock objects for device, view, and sample
 */
export function setupBasicDeviceMock(config: BasicDeviceConfig = {}): {
  device: RegisteredMockObject;
  view?: RegisteredMockObject;
  sample?: RegisteredMockObject;
} {
  const {
    id = "device-123",
    path,
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
  const sampleObjId = "sample-obj";
  const devicePath = path ?? `id ${id}`;
  const viewIdPath = `id ${id} view`;
  const sampleObjPath = `id ${sampleObjId}`;

  // Register the main device
  const device = registerMockObject(id, {
    path: devicePath,
    type: "Device",
    properties: {
      name: deviceName,
      class_display_name,
      type,
      can_have_chains,
      can_have_drum_pads,
      is_active,
      parameters: [],
      sample: sample ? ["id", sampleObjId] : [],
    },
    // For rack devices with chains
    methods:
      can_have_chains === 1 || chainIds.length > 0
        ? {
            getChildren: (...args: unknown[]) => {
              const childType = args[0];

              if (childType === "chains" || childType === "return_chains") {
                return chainIds.flatMap((c) => ["id", c]);
              }

              if (childType === "drum_pads") return [];

              return [];
            },
          }
        : {},
  });

  // Register view object if collapsed state is specified
  let viewMock: RegisteredMockObject | undefined;

  if (is_collapsed !== undefined) {
    viewMock = registerMockObject(`view-${id}`, {
      path: viewIdPath,
      type: "Device.View",
      properties: {
        is_collapsed,
      },
    });
  }

  // Register sample object if sample path is specified
  let sampleMock: RegisteredMockObject | undefined;

  if (sample !== undefined) {
    sampleMock = registerMockObject(sampleObjId, {
      path: sampleObjPath,
      type: "Sample",
      properties: {
        file_path: sample,
      },
    });
  }

  return {
    device,
    view: viewMock,
    sample: sampleMock,
  };
}

interface ChainMockConfig {
  id?: string;
  path?: string;
  name?: string;
  mute?: number;
  solo?: number;
  color?: number;
  deviceIds?: string[];
}

/**
 * Setup mocks for chain reading tests. Reduces boilerplate for chain property tests.
 * @param config - Chain configuration
 * @returns Registered mock object for the chain
 */
export function setupChainMock(
  config: ChainMockConfig = {},
): RegisteredMockObject {
  const {
    id = "chain-123",
    path = livePath.track(1).device(0).chain(0),
    name = "Chain",
    deviceIds = [],
  } = config;

  // Build properties object - only include what was explicitly provided
  const properties: Record<string, unknown> = {
    name,
    mute: config.mute ?? 0,
    solo: config.solo ?? 0,
    devices: deviceIds.flatMap((d) => ["id", d]),
    // Empty array for color means getProperty returns undefined (no color)
    // Providing a number means getProperty returns that number (has color)
    color: config.color ?? [],
  };

  // Register the chain
  return registerMockObject(id, {
    path,
    type: "Chain",
    properties,
    methods: {
      getChildren: (...args: unknown[]) => {
        const childType = args[0];

        if (childType === "devices") {
          return deviceIds.flatMap((d) => ["id", d]);
        }

        return [];
      },
    },
  });
}
