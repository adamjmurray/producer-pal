// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "#src/tools/device/read/read-device.ts";
import {
  applySpecializedParamWrite,
  readSpecializedParams,
} from "../specialized-device-registry.ts";

// Default property values for a Drift device at factory defaults.
const DRIFT_DEFAULTS = {
  class_display_name: "Drift",
  mod_matrix_filter_source_1_index: 0,
  mod_matrix_filter_source_2_index: 0,
  mod_matrix_lfo_source_index: 0,
  mod_matrix_pitch_source_1_index: 0,
  mod_matrix_pitch_source_2_index: 0,
  mod_matrix_shape_source_index: 0,
  mod_matrix_source_1_index: 0,
  mod_matrix_source_2_index: 0,
  mod_matrix_source_3_index: 0,
  mod_matrix_target_1_index: 0,
  mod_matrix_target_2_index: 0,
  mod_matrix_target_3_index: 0,
  voice_mode_index: 0,
  voice_count_index: 0,
  pitch_bend_range: 2,
};

/**
 * Register a mock Drift device and return its LiveAPI.
 * @param properties - Property overrides (merged onto Drift defaults)
 * @returns The Drift LiveAPI object
 */
function registerDrift(properties: Record<string, unknown> = {}): LiveAPI {
  registerMockObject("drift-1", {
    type: "DriftDevice",
    properties: { ...DRIFT_DEFAULTS, ...properties },
  });

  return LiveAPI.from("id drift-1");
}

describe("Drift pseudo-params", () => {
  describe("read source slots", () => {
    it.each([
      ["filterMod1Source", "mod_matrix_filter_source_1_index"],
      ["filterMod2Source", "mod_matrix_filter_source_2_index"],
      ["lfoSource", "mod_matrix_lfo_source_index"],
      ["pitchMod1Source", "mod_matrix_pitch_source_1_index"],
      ["pitchMod2Source", "mod_matrix_pitch_source_2_index"],
      ["shapeSource", "mod_matrix_shape_source_index"],
    ])("%s reads index 0 as 'Env 1'", (paramName, property) => {
      const device = registerDrift({ [property]: 0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: paramName,
        value: "Env 1",
      });
    });

    it("reads source index 2 as 'LFO'", () => {
      const device = registerDrift({ mod_matrix_filter_source_1_index: 2 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "filterMod1Source",
        value: "LFO",
      });
    });

    it("reads source index 7 (last) as 'Slide'", () => {
      const device = registerDrift({ mod_matrix_shape_source_index: 7 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "shapeSource",
        value: "Slide",
      });
    });

    it("reads all source labels in index order", () => {
      const device = registerDrift({ mod_matrix_filter_source_1_index: 4 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "filterMod1Source",
        value: "Vel",
      });
    });
  });

  describe("read free-slot sources", () => {
    it.each([
      ["mod1Source", "mod_matrix_source_1_index", "mod_matrix_target_1_index"],
      ["mod2Source", "mod_matrix_source_2_index", "mod_matrix_target_2_index"],
      ["mod3Source", "mod_matrix_source_3_index", "mod_matrix_target_3_index"],
    ])(
      "%s is read when its paired target is active",
      (paramName, sourceProp, targetProp) => {
        const device = registerDrift({
          [sourceProp]: 2, // LFO
          [targetProp]: 6, // LP Frequency (active)
        });

        expect(readSpecializedParams(device)).toContainEqual({
          name: paramName,
          value: "LFO",
        });
      },
    );

    it.each([
      ["mod1Source", "mod_matrix_source_1_index", "mod_matrix_target_1_index"],
      ["mod2Source", "mod_matrix_source_2_index", "mod_matrix_target_2_index"],
      ["mod3Source", "mod_matrix_source_3_index", "mod_matrix_target_3_index"],
    ])(
      "%s is omitted when its paired target is 'None' (slot disabled)",
      (paramName, sourceProp, targetProp) => {
        const device = registerDrift({
          [sourceProp]: 2, // a source is selected in Live's UI...
          [targetProp]: 0, // ...but the target is "None", so the slot is off
        });

        const names = readSpecializedParams(device).map((p) => p.name);

        expect(names).not.toContain(paramName);
      },
    );

    it("omits a free-slot source when target index is out of range", () => {
      // TARGETS has 12 labels (indices 0-11). Index 99 returns undefined from
      // readEnumByIndex — without the `== null` guard, the source would emit as
      // a phantom active route even though the target field is omitted.
      const device = registerDrift({
        mod_matrix_source_1_index: 2,
        mod_matrix_target_1_index: 99,
      });

      const names = readSpecializedParams(device).map((p) => p.name);

      expect(names).not.toContain("mod1Source");
    });
  });

  describe("read target slots", () => {
    it.each([
      ["mod1Target", "mod_matrix_target_1_index"],
      ["mod2Target", "mod_matrix_target_2_index"],
      ["mod3Target", "mod_matrix_target_3_index"],
    ])("%s reads index 0 as 'None'", (paramName, property) => {
      const device = registerDrift({ [property]: 0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: paramName,
        value: "None",
      });
    });

    it("reads target index 6 as 'LP Frequency'", () => {
      const device = registerDrift({ mod_matrix_target_1_index: 6 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "mod1Target",
        value: "LP Frequency",
      });
    });

    it("reads target index 11 (last) as 'Main Volume'", () => {
      const device = registerDrift({ mod_matrix_target_3_index: 11 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "mod3Target",
        value: "Main Volume",
      });
    });
  });

  describe("read voiceMode", () => {
    it.each([
      [0, "Poly"],
      [1, "Mono"],
      [2, "Stereo"],
      [3, "Unison"],
    ])("reads voice_mode_index %i as '%s'", (index, label) => {
      const device = registerDrift({ voice_mode_index: index });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "voiceMode",
        value: label,
      });
    });
  });

  describe("read voiceCount", () => {
    it.each([
      [0, 4],
      [1, 8],
      [2, 16],
      [3, 24],
      [4, 32],
    ])("reads voice_count_index %i as %i", (index, count) => {
      const device = registerDrift({ voice_count_index: index });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "voiceCount",
        value: count,
      });
    });
  });

  describe("read pitchBendRange", () => {
    it("reads pitch_bend_range as a number", () => {
      const device = registerDrift({ pitch_bend_range: 12 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "pitchBendRange",
        value: 12,
      });
    });
  });

  describe("write source slots", () => {
    it("maps a valid source label to its index", () => {
      const device = registerDrift();

      applySpecializedParamWrite(
        device,
        "filterMod1Source",
        "LFO",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith(
        "mod_matrix_filter_source_1_index",
        2,
      );
    });

    it("maps the last source label 'Slide' to index 7", () => {
      const device = registerDrift();

      applySpecializedParamWrite(device, "mod3Source", "Slide", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mod_matrix_source_3_index", 7);
    });

    it("is case-insensitive on the param name", () => {
      const device = registerDrift();

      applySpecializedParamWrite(
        device,
        "filtermod1source",
        "Env 2",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith(
        "mod_matrix_filter_source_1_index",
        1,
      );
    });

    it("warns and skips an invalid source label", () => {
      const device = registerDrift();

      applySpecializedParamWrite(
        device,
        "lfoSource",
        "BogusSource",
        "updateDevice",
      );

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("not a valid lfoSource"),
      );
    });
  });

  describe("write target slots", () => {
    it("maps 'None' to index 0 (disables slot)", () => {
      const device = registerDrift({ mod_matrix_target_1_index: 6 });

      applySpecializedParamWrite(device, "mod1Target", "None", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mod_matrix_target_1_index", 0);
    });

    it("maps 'LP Frequency' to index 6", () => {
      const device = registerDrift();

      applySpecializedParamWrite(
        device,
        "mod2Target",
        "LP Frequency",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith("mod_matrix_target_2_index", 6);
    });

    it("maps 'Main Volume' to index 11", () => {
      const device = registerDrift();

      applySpecializedParamWrite(
        device,
        "mod3Target",
        "Main Volume",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith("mod_matrix_target_3_index", 11);
    });

    it("warns and skips an invalid target label", () => {
      const device = registerDrift();

      applySpecializedParamWrite(
        device,
        "mod1Target",
        "BogusTarget",
        "updateDevice",
      );

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("not a valid mod1Target"),
      );
    });
  });

  describe("write voiceMode", () => {
    it("maps 'Poly' to index 0", () => {
      const device = registerDrift({ voice_mode_index: 2 });

      applySpecializedParamWrite(device, "voiceMode", "Poly", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("voice_mode_index", 0);
    });

    it("maps 'Unison' to index 3", () => {
      const device = registerDrift();

      applySpecializedParamWrite(device, "voiceMode", "Unison", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("voice_mode_index", 3);
    });

    it("warns and skips an invalid voiceMode label", () => {
      const device = registerDrift();

      applySpecializedParamWrite(device, "voiceMode", "Quad", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("not a valid voiceMode"),
      );
    });
  });

  describe("write voiceCount", () => {
    it.each([
      [4, 0],
      [8, 1],
      [16, 2],
      [24, 3],
      [32, 4],
    ])("maps voiceCount %i to index %i", (count, index) => {
      const device = registerDrift();

      applySpecializedParamWrite(device, "voiceCount", count, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("voice_count_index", index);
    });

    it("warns and skips a value not in the allowed set", () => {
      const device = registerDrift();

      applySpecializedParamWrite(device, "voiceCount", 12, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("voiceCount"),
      );
    });

    it("warns and skips a non-integer value", () => {
      const device = registerDrift();

      applySpecializedParamWrite(device, "voiceCount", 8.5, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("voiceCount"),
      );
    });
  });

  describe("write pitchBendRange", () => {
    it("sets pitch_bend_range for a valid integer", () => {
      const device = registerDrift();

      applySpecializedParamWrite(device, "pitchBendRange", 12, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("pitch_bend_range", 12);
    });

    it("sets pitch_bend_range when value is a numeric string", () => {
      const device = registerDrift();

      applySpecializedParamWrite(device, "pitchBendRange", "7", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("pitch_bend_range", 7);
    });

    it("sets the boundary value 0", () => {
      const device = registerDrift();

      applySpecializedParamWrite(device, "pitchBendRange", 0, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("pitch_bend_range", 0);
    });

    it("warns and skips an out-of-range value (Live reverts, does not clamp)", () => {
      // pitch_bend_range max is 12; Live silently reverts >12 writes, so we
      // pre-validate rather than pass the value through.
      const device = registerDrift();

      applySpecializedParamWrite(device, "pitchBendRange", 13, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("pitchBendRange"),
      );
    });

    it("warns and skips a non-integer value", () => {
      const device = registerDrift();

      applySpecializedParamWrite(
        device,
        "pitchBendRange",
        "1.5",
        "updateDevice",
      );

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("pitchBendRange"),
      );
    });

    it("warns and skips a non-numeric string", () => {
      const device = registerDrift();

      applySpecializedParamWrite(
        device,
        "pitchBendRange",
        "lots",
        "updateDevice",
      );

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("pitchBendRange"),
      );
    });
  });
});

// Integration through the read-device tool: confirms pseudo-params surface in
// the `parameters` output and that Drift contributes no modulations/options.
describe("Drift via read-device", () => {
  /**
   * Register a fully-readable mock Drift instrument by ID.
   * @param properties - Property overrides
   */
  function registerReadableDrift(
    properties: Record<string, unknown> = {},
  ): void {
    registerMockObject("drift-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        name: "Drift",
        type: 1,
        can_have_chains: 0,
        can_have_drum_pads: 0,
        is_active: 1,
        parameters: [],
        ...DRIFT_DEFAULTS,
        voice_mode_index: 1,
        voice_count_index: 2,
        pitch_bend_range: 4,
        mod_matrix_filter_source_1_index: 2,
        // All three free slots have active targets so every free-slot source is
        // present (see the omit-when-None case below).
        mod_matrix_target_1_index: 6,
        mod_matrix_target_2_index: 7,
        mod_matrix_target_3_index: 9,
        ...properties,
      },
    });
  }

  it("includes all pseudo-params in parameters and omits modulations", () => {
    registerReadableDrift();

    const result = readDevice({ deviceId: "drift-1", include: ["params"] });

    expect(result.parameters).toContainEqual({
      name: "filterMod1Source",
      value: "LFO",
    });
    expect(result.parameters).toContainEqual({
      name: "mod1Target",
      value: "LP Frequency",
    });
    expect(result.parameters).toContainEqual({
      name: "voiceMode",
      value: "Mono",
    });
    expect(result.parameters).toContainEqual({
      name: "voiceCount",
      value: 16,
    });
    expect(result.parameters).toContainEqual({
      name: "pitchBendRange",
      value: 4,
    });
    expect(result.modulations).toBeUndefined();
  });

  it("includes all 15 pseudo-params", () => {
    registerReadableDrift();

    const result = readDevice({ deviceId: "drift-1", include: ["params"] });

    expect(result.parameters).toHaveLength(15);
  });

  it("reads 'None' target correctly via read-device", () => {
    registerReadableDrift({ mod_matrix_target_2_index: 0 });

    const result = readDevice({ deviceId: "drift-1", include: ["params"] });

    expect(result.parameters).toContainEqual({
      name: "mod2Target",
      value: "None",
    });
  });

  it("omits a free-slot source whose target is 'None' via read-device", () => {
    registerReadableDrift({ mod_matrix_target_2_index: 0 });

    const result = readDevice({ deviceId: "drift-1", include: ["params"] });
    const names = (result.parameters as Array<{ name: string }>).map(
      (p) => p.name,
    );

    expect(names).not.toContain("mod2Source");
    // The other free slots stay active and present.
    expect(names).toContain("mod1Source");
    expect(names).toContain("mod3Source");
  });

  it("surfaces pseudo-param valid values under options.paramOptions", () => {
    registerReadableDrift();

    const result = readDevice({ deviceId: "drift-1", include: ["options"] });
    const paramOptions = (result.options as Record<string, unknown>)
      .paramOptions as Record<string, unknown>;

    expect(paramOptions.voiceMode).toStrictEqual([
      "Poly",
      "Mono",
      "Stereo",
      "Unison",
    ]);
    expect(paramOptions.voiceCount).toStrictEqual([4, 8, 16, 24, 32]);
    expect(paramOptions.pitchBendRange).toBe("0-12");
    expect(paramOptions.filterMod1Source).toStrictEqual([
      "Env 1",
      "Env 2",
      "LFO",
      "Key",
      "Vel",
      "Mod",
      "Press",
      "Slide",
    ]);
    expect(paramOptions.mod1Target).toContain("None");
  });
});
