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
  readSpecializedOptions,
  readSpecializedParams,
} from "../../specialized-device-registry.ts";

// Category list for testing: underscore-separated internal names.
const MOCK_CATEGORY_LIST = [
  "Early_Reflections",
  "Halls",
  "Real_Places",
] as const;

// File list for the default (Halls) category.
const MOCK_FILE_LIST = ["Berliner Hall LR", "Town Hall Long", "Studio Verb"];

/**
 * Register a mock Hybrid Reverb device and return its LiveAPI.
 * List props register flat (["a","b"]) so getPropertyList() returns ["a","b"].
 * @param properties - Property overrides merged onto Hybrid Reverb defaults
 * @returns The Hybrid Reverb LiveAPI object
 */
function registerHybridReverb(
  properties: Record<string, unknown> = {},
): LiveAPI {
  registerMockObject("hr-1", {
    type: "Device",
    properties: {
      class_display_name: "Hybrid Reverb",
      ir_category_index: 1,
      ir_category_list: MOCK_CATEGORY_LIST,
      ir_file_index: 0,
      ir_file_list: MOCK_FILE_LIST,
      ir_attack_time: 0.1,
      ir_decay_time: 5.0,
      ir_size_factor: 1.0,
      ir_time_shaping_on: 0,
      ...properties,
    },
  });

  return LiveAPI.from("id hr-1");
}

describe("Hybrid Reverb pseudo-params", () => {
  describe("irCategory read", () => {
    it("maps index to a space-separated category name", () => {
      // index 1 → "Halls" (no underscores in this name)
      const device = registerHybridReverb({ ir_category_index: 1 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "irCategory",
        value: "Halls",
      });
    });

    it("translates underscores to spaces for multi-word names", () => {
      // index 0 → "Early_Reflections" → "Early Reflections"
      const device = registerHybridReverb({ ir_category_index: 0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "irCategory",
        value: "Early Reflections",
      });
    });

    it("omits irCategory when the index is out of range", () => {
      const device = registerHybridReverb({ ir_category_index: 99 });

      const names = readSpecializedParams(device).map((p) => p.name);

      expect(names).not.toContain("irCategory");
    });

    it("translates underscores to spaces for index 2", () => {
      // index 2 → "Real_Places" → "Real Places"
      const device = registerHybridReverb({ ir_category_index: 2 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "irCategory",
        value: "Real Places",
      });
    });
  });

  describe("irCategory write", () => {
    it("translates spaces to underscores and sets the index", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(
        device,
        "irCategory",
        "Early Reflections",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith("ir_category_index", 0);
    });

    it("sets index for a single-word category", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(device, "irCategory", "Halls", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("ir_category_index", 1);
    });

    it("warns and skips for an invalid category", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(
        device,
        "irCategory",
        "Bogus Category",
        "updateDevice",
      );

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("not a valid irCategory"),
      );
    });

    it("warning includes available categories with spaces", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(
        device,
        "irCategory",
        "Unknown",
        "updateDevice",
      );

      // The whole catalog, comma-separated and de-underscored — this warning is
      // the model's only listing of the valid category names.
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining(
          "Available: Early Reflections, Halls, Real Places",
        ),
      );
    });
  });

  describe("irFile read", () => {
    it("maps index to the file name", () => {
      // ir_file_index 1 → "Town Hall Long"
      const device = registerHybridReverb({ ir_file_index: 1 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "irFile",
        value: "Town Hall Long",
      });
    });

    it("returns undefined for the <empty> sentinel", () => {
      const device = registerHybridReverb({
        ir_file_list: ["<empty>"],
        ir_file_index: 0,
      });

      const params = readSpecializedParams(device);
      const irFileParam = params.find((p) => p.name === "irFile");

      // undefined means the entry is omitted from output
      expect(irFileParam).toBeUndefined();
    });
  });

  describe("irFile write", () => {
    it("finds the file name and sets the index", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(
        device,
        "irFile",
        "Town Hall Long",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith("ir_file_index", 1);
    });

    it("warns and skips for an unknown file", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(
        device,
        "irFile",
        "Nonexistent File",
        "updateDevice",
      );

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("not a valid irFile"),
      );
    });

    it("warns and skips when category is empty (sentinel only)", () => {
      const device = registerHybridReverb({
        ir_file_list: ["<empty>"],
      });

      applySpecializedParamWrite(device, "irFile", "Any File", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("no files"),
      );
    });

    it("sets the only file in a single-file category", () => {
      // A one-entry list is "empty" only when that entry is the sentinel — a
      // category holding exactly one real IR must still be settable.
      const device = registerHybridReverb({
        ir_file_list: ["Solo Hall"],
      });

      applySpecializedParamWrite(device, "irFile", "Solo Hall", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("ir_file_index", 0);
    });

    it("sets the first file in the list (index 0)", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(
        device,
        "irFile",
        "Berliner Hall LR",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith("ir_file_index", 0);
    });
  });

  describe("irAttackTime", () => {
    it("reads the float property", () => {
      const device = registerHybridReverb({ ir_attack_time: 0.25 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "irAttackTime",
        value: 0.25,
      });
    });

    it("sets a valid number", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(device, "irAttackTime", 0.5, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("ir_attack_time", 0.5);
    });

    it("sets a valid number passed as a string", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(device, "irAttackTime", "1.5", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("ir_attack_time", 1.5);
    });

    it("warns and skips for a non-numeric string", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(device, "irAttackTime", "abc", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("irAttackTime"),
      );
    });
  });

  describe("irDecayTime", () => {
    it("reads the float property", () => {
      const device = registerHybridReverb({ ir_decay_time: 12.5 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "irDecayTime",
        value: 12.5,
      });
    });

    it("sets a valid number", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(device, "irDecayTime", 3.0, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("ir_decay_time", 3);
    });

    it("warns and skips for a non-numeric string", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(device, "irDecayTime", "abc", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("irDecayTime"),
      );
    });
  });

  describe("irSizeFactor", () => {
    it("reads the float property", () => {
      const device = registerHybridReverb({ ir_size_factor: 2.0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "irSizeFactor",
        value: 2.0,
      });
    });

    it("sets a valid number", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(device, "irSizeFactor", 0.5, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("ir_size_factor", 0.5);
    });

    it("warns and skips for a non-numeric string", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(device, "irSizeFactor", "abc", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("irSizeFactor"),
      );
    });
  });

  describe("irTimeShapingOn", () => {
    it("reads false when property is 0", () => {
      const device = registerHybridReverb({ ir_time_shaping_on: 0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "irTimeShapingOn",
        value: false,
      });
    });

    it("reads true when property is 1", () => {
      const device = registerHybridReverb({ ir_time_shaping_on: 1 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "irTimeShapingOn",
        value: true,
      });
    });

    it("writes 1 for true", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(
        device,
        "irTimeShapingOn",
        "true",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith("ir_time_shaping_on", 1);
    });

    it("writes 0 for false", () => {
      const device = registerHybridReverb({ ir_time_shaping_on: 1 });

      applySpecializedParamWrite(
        device,
        "irTimeShapingOn",
        "off",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith("ir_time_shaping_on", 0);
    });

    it("warns naming irTimeShapingOn and skips uninterpretable input", () => {
      const device = registerHybridReverb();

      applySpecializedParamWrite(
        device,
        "irTimeShapingOn",
        "maybe",
        "updateDevice",
      );

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining(
          '"maybe" is not a valid irTimeShapingOn (expected true/false)',
        ),
      );
    });
  });

  describe("readOptions", () => {
    it("returns irFileList filtered of the <empty> sentinel", () => {
      const device = registerHybridReverb();

      const options = readSpecializedOptions(device);

      expect(options.irFileList).toStrictEqual(MOCK_FILE_LIST);
    });

    it("returns irCategoryList with underscores translated to spaces", () => {
      const device = registerHybridReverb();

      const options = readSpecializedOptions(device);

      expect(options.irCategoryList).toStrictEqual([
        "Early Reflections",
        "Halls",
        "Real Places",
      ]);
    });

    it("returns empty irFileList when the category has only the sentinel", () => {
      const device = registerHybridReverb({
        ir_file_list: ["<empty>"],
      });

      const options = readSpecializedOptions(device);

      expect(options.irFileList).toStrictEqual([]);
    });

    it("excludes the sentinel but keeps other files when mixed", () => {
      const device = registerHybridReverb({
        ir_file_list: ["File A", "<empty>", "File B"],
      });

      const options = readSpecializedOptions(device);

      expect(options.irFileList).toStrictEqual(["File A", "File B"]);
    });
  });
});

// Integration through the read-device tool: confirms pseudo-params surface in
// the `parameters` output and that irFileList appears in options.
describe("Hybrid Reverb via read-device", () => {
  /**
   * Register a fully-readable mock Hybrid Reverb device by ID.
   * @param properties - Property overrides
   */
  function registerReadableHybridReverb(
    properties: Record<string, unknown> = {},
  ): void {
    registerMockObject("hr-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        name: "Hybrid Reverb",
        class_display_name: "Hybrid Reverb",
        type: 2,
        can_have_chains: 0,
        can_have_drum_pads: 0,
        is_active: 1,
        parameters: [],
        ir_category_index: 1,
        ir_category_list: MOCK_CATEGORY_LIST,
        ir_file_index: 0,
        ir_file_list: MOCK_FILE_LIST,
        ir_attack_time: 0.1,
        ir_decay_time: 5.0,
        ir_size_factor: 1.0,
        ir_time_shaping_on: 0,
        ...properties,
      },
    });
  }

  it("includes pseudo-params in parameters and options.irFileList when requested", () => {
    registerReadableHybridReverb();

    const result = readDevice({
      deviceId: "hr-1",
      include: ["params", "options"],
    });

    expect(result.parameters).toContainEqual({
      name: "irCategory",
      value: "Halls",
    });
    expect(result.parameters).toContainEqual({
      name: "irFile",
      value: "Berliner Hall LR",
    });
    expect(result.parameters).toContainEqual({
      name: "irAttackTime",
      value: 0.1,
    });
    expect(result.parameters).toContainEqual({
      name: "irDecayTime",
      value: 5.0,
    });
    expect(result.parameters).toContainEqual({
      name: "irSizeFactor",
      value: 1.0,
    });
    expect(result.parameters).toContainEqual({
      name: "irTimeShapingOn",
      value: false,
    });

    expect(result.options).toBeDefined();
    expect(
      (result.options as Record<string, unknown>).irFileList,
    ).toStrictEqual(MOCK_FILE_LIST);
  });

  it("omits options when the include does not contain options", () => {
    registerReadableHybridReverb();

    const result = readDevice({
      deviceId: "hr-1",
      include: ["params"],
    });

    expect(result.options).toBeUndefined();
  });

  it("omits modulations for Hybrid Reverb", () => {
    registerReadableHybridReverb();

    const result = readDevice({
      deviceId: "hr-1",
      include: ["params", "options"],
    });

    expect(result.modulations).toBeUndefined();
  });
});
