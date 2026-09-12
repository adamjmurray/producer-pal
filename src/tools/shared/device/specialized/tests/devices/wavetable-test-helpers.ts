// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { expect } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

// Shared mock data + builders for the Wavetable specs (wavetable.test.ts and
// wavetable-modulation-helpers.test.ts).

export const OSC_CATEGORIES = ["Basic Shapes", "Bass", "Pads"];
export const OSC1_WAVETABLES = ["Saw Dual 1", "Saw Dual 2", "Pulse"];
export const OSC2_WAVETABLES = ["Square", "Triangle", "Sine"];

// Parameter IDs — pairs for getChildIds: ["id", "p1", "id", "p2", ...]
export const PARAM_IDS = ["id", "p1", "id", "p2", "id", "p3"];

/**
 * Register the three standard param mocks referenced by PARAM_IDS.
 */
export function registerStandardParamMocks(): void {
  registerMockObject("p1", { properties: { name: "Osc 1 Pos" } });
  registerMockObject("p2", { properties: { name: "Filter Freq" } });
  registerMockObject("p3", { properties: { name: "Volume" } });
}

/**
 * Build mock methods for modulation matrix operations.
 * get_modulation_target_parameter_name returns the name for i < targets.length,
 * numeric sentinel 1 otherwise. get_modulation_value reads from sparse cells map.
 * @param targets - Target parameter names in index order
 * @param cells - Sparse non-zero cell map "targetIdx,sourceIdx" → amount
 * @param modulatable - Whether is_parameter_modulatable returns 1
 * @returns methods object for registerMockObject
 */
export function buildModMethods(
  targets: string[],
  cells: Record<string, number> = {},
  modulatable = 1,
): Record<string, (...args: unknown[]) => unknown> {
  return {
    get_modulation_target_parameter_name: (i: unknown) =>
      (i as number) < targets.length ? targets[i as number] : 1,
    get_modulation_value: (t: unknown, s: unknown) =>
      cells[`${String(t)},${String(s)}`] ?? 0,
    set_modulation_value: () => null,
    add_parameter_to_modulation_matrix: () => null,
    is_parameter_modulatable: () => modulatable,
  };
}

/**
 * Register a mock Wavetable device and return its LiveAPI.
 * List props register flat ([a,b]) so getPropertyList() returns [a,b].
 * @param properties - Property overrides merged onto Wavetable defaults
 * @param methods - Method overrides for device.call()
 * @returns The Wavetable LiveAPI object
 */
export function registerWavetable(
  properties: Record<string, unknown> = {},
  methods: Record<string, (...args: unknown[]) => unknown> = {},
): LiveAPI {
  registerMockObject("wt-1", {
    type: "Device",
    properties: {
      class_display_name: "Wavetable",
      filter_routing: 0,
      mono_poly: 0,
      poly_voices: 4,
      unison_mode: 0,
      unison_voice_count: 2,
      oscillator_1_effect_mode: 0,
      oscillator_2_effect_mode: 0,
      oscillator_1_wavetable_category: 0,
      oscillator_2_wavetable_category: 0,
      oscillator_1_wavetable_index: 0,
      oscillator_2_wavetable_index: 0,
      oscillator_wavetable_categories: OSC_CATEGORIES,
      oscillator_1_wavetables: OSC1_WAVETABLES,
      oscillator_2_wavetables: OSC2_WAVETABLES,
      parameters: PARAM_IDS,
      ...properties,
    },
    methods: { ...buildModMethods([], {}, 0), ...methods },
  });

  registerStandardParamMocks();

  return LiveAPI.from("id wt-1");
}

/**
 * Assert that no modulation value was written and a warning was emitted.
 * @param device - The mock device to inspect (the returned LiveAPI from registerWavetable)
 * @param warningSubstring - Substring expected in the warning message
 */
export function expectModulationNotSet(
  device: LiveAPI,
  warningSubstring: string,
): void {
  expect(device.call).not.toHaveBeenCalledWith(
    "set_modulation_value",
    expect.anything(),
    expect.anything(),
    expect.anything(),
  );
  expect(capturedWarnings()).toContainEqual(
    expect.stringContaining(warningSubstring),
  );
}
