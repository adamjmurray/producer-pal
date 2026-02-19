// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "../read-device.ts";

/**
 * Setup device with two parameters for search testing
 * @param includeFullProps - Whether to include full param properties (for param-values)
 */
function setupTwoParamDevice(includeFullProps = false) {
  // Register the device
  registerMockObject("device-123", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      name: "Operator",
      class_display_name: "Operator",
      type: 1,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      parameters: ["id", "param-1", "id", "param-2"],
    },
  });

  // Register param-1 (Volume)
  registerMockObject("param-1", {
    path: livePath.track(0).device(0).parameter(0),
    type: "DeviceParameter",
    properties: {
      name: "Volume",
      original_name: "Volume",
      ...(includeFullProps
        ? {
            value: 0.5,
            state: 0,
            is_enabled: 1,
            automation_state: 0,
            min: 0,
            max: 1,
            is_quantized: 0,
            default_value: 0.7,
            display_value: -6,
          }
        : {}),
    },
    methods: includeFullProps
      ? {
          str_for_value: (value: unknown) => {
            if (value === 0) return "-inf dB";
            if (value === 1) return "0 dB";

            return "-6 dB";
          },
        }
      : {},
  });

  // Register param-2 (Filter Cutoff)
  registerMockObject("param-2", {
    path: livePath.track(0).device(0).parameter(1),
    type: "DeviceParameter",
    properties: {
      name: "Filter Cutoff",
      original_name: "Filter Cutoff",
      ...(includeFullProps
        ? {
            value: 1000,
            state: 0,
            is_enabled: 1,
            automation_state: 0,
            min: 20,
            max: 20000,
            is_quantized: 0,
            default_value: 10000,
            display_value: 1000,
          }
        : {}),
    },
    methods: includeFullProps
      ? {
          str_for_value: (value: unknown) => {
            if (value === 20) return "20 Hz";
            if (value === 20000) return "20.0 kHz";

            return "1.00 kHz";
          },
        }
      : {},
  });
}

describe("readDevice paramSearch filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("should filter parameters by case-insensitive substring match", () => {
    setupTwoParamDevice();

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
      paramSearch: "vol",
    });

    const params = result.parameters as Record<string, unknown>[];

    expect(params).toHaveLength(1);
    expect(params[0]!.name).toBe("Volume");
  });

  it("should be case-insensitive when filtering", () => {
    setupTwoParamDevice();

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
      paramSearch: "FILTER",
    });

    const params = result.parameters as Record<string, unknown>[];

    expect(params).toHaveLength(1);
    expect(params[0]!.name).toBe("Filter Cutoff");
  });

  it("should return empty array when no parameters match", () => {
    setupTwoParamDevice();

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
      paramSearch: "nonexistent",
    });

    expect(result.parameters).toHaveLength(0);
  });

  it("should work with param-values include", () => {
    setupTwoParamDevice(true); // Include full properties

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
      paramSearch: "vol",
    });

    const params = result.parameters as Record<string, unknown>[];

    expect(params).toHaveLength(1);
    // New format: parsed value with unit, min/max from label parsing
    expect(params[0]).toStrictEqual({
      id: "param-1",
      name: "Volume",
      value: -6,
      min: -70, // -inf dB → -70
      max: 0,
      unit: "dB",
    });
  });
});
