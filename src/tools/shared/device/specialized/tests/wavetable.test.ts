// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it, type Mock } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "#src/tools/device/read/read-device.ts";
import {
  applySpecializedActions,
  applySpecializedParamWrite,
  readSpecializedModulations,
  readSpecializedOptions,
  readSpecializedParams,
} from "../specialized-device-registry.ts";

// Shared mock data
const OSC_CATEGORIES = ["Basic Shapes", "Bass", "Pads"];
const OSC1_WAVETABLES = ["Saw Dual 1", "Saw Dual 2", "Pulse"];
const OSC2_WAVETABLES = ["Square", "Triangle", "Sine"];

// Parameter IDs — pairs for getChildIds: ["id", "p1", "id", "p2", ...]
const PARAM_IDS = ["id", "p1", "id", "p2", "id", "p3"];

/**
 * Build mock methods for modulation matrix operations.
 * get_modulation_target_parameter_name returns the name for i < targets.length,
 * numeric sentinel 1 otherwise. get_modulation_value reads from sparse cells map.
 * @param targets - Target parameter names in index order
 * @param cells - Sparse non-zero cell map "targetIdx,sourceIdx" → amount
 * @param modulatable - Whether is_parameter_modulatable returns 1
 * @returns methods object for registerMockObject
 */
function buildModMethods(
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
 * Lists must be double-nested: register [[a,b]] so getProperty() returns [a,b].
 * @param properties - Property overrides merged onto Wavetable defaults
 * @param methods - Method overrides for device.call()
 * @returns The Wavetable LiveAPI object
 */
function registerWavetable(
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
      oscillator_wavetable_categories: [OSC_CATEGORIES],
      oscillator_1_wavetables: [OSC1_WAVETABLES],
      oscillator_2_wavetables: [OSC2_WAVETABLES],
      parameters: PARAM_IDS,
      ...properties,
    },
    methods: { ...buildModMethods([], {}, 0), ...methods },
  });

  registerMockObject("p1", { properties: { name: "Osc 1 Pos" } });
  registerMockObject("p2", { properties: { name: "Filter Freq" } });
  registerMockObject("p3", { properties: { name: "Volume" } });

  return LiveAPI.from("id wt-1");
}

describe("Wavetable pseudo-params — read", () => {
  it("reads all three filterRouting values by index", () => {
    for (const [i, label] of (
      ["serial", "parallel", "split"] as const
    ).entries()) {
      const device = registerWavetable({ filter_routing: i });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "filterRouting",
        value: label,
      });
    }
  });

  it("reads monoPoly enum (mono and poly)", () => {
    expect(
      readSpecializedParams(registerWavetable({ mono_poly: 0 })),
    ).toContainEqual({ name: "monoPoly", value: "mono" });

    expect(
      readSpecializedParams(registerWavetable({ mono_poly: 1 })),
    ).toContainEqual({ name: "monoPoly", value: "poly" });
  });

  it("reads polyVoices as a number", () => {
    expect(
      readSpecializedParams(registerWavetable({ poly_voices: 8 })),
    ).toContainEqual({ name: "polyVoices", value: 8 });
  });

  it("reads unisonMode enum", () => {
    expect(
      readSpecializedParams(registerWavetable({ unison_mode: 3 })),
    ).toContainEqual({ name: "unisonMode", value: "noise" });
  });

  it("reads unisonVoiceCount as a number", () => {
    expect(
      readSpecializedParams(registerWavetable({ unison_voice_count: 4 })),
    ).toContainEqual({ name: "unisonVoiceCount", value: 4 });
  });

  it("reads osc1Engine and osc2Engine as integers", () => {
    const device = registerWavetable({
      oscillator_1_effect_mode: 2,
      oscillator_2_effect_mode: 1,
    });
    const params = readSpecializedParams(device);

    expect(params).toContainEqual({ name: "osc1Engine", value: 2 });
    expect(params).toContainEqual({ name: "osc2Engine", value: 1 });
  });

  it("reads osc1Category and osc2Category from shared category list", () => {
    const device = registerWavetable({
      oscillator_1_wavetable_category: 1,
      oscillator_2_wavetable_category: 2,
    });
    const params = readSpecializedParams(device);

    expect(params).toContainEqual({ name: "osc1Category", value: "Bass" });
    expect(params).toContainEqual({ name: "osc2Category", value: "Pads" });
  });

  it("reads osc1Wavetable and osc2Wavetable from per-osc lists", () => {
    const device = registerWavetable({
      oscillator_1_wavetable_index: 1,
      oscillator_2_wavetable_index: 2,
    });
    const params = readSpecializedParams(device);

    expect(params).toContainEqual({
      name: "osc1Wavetable",
      value: "Saw Dual 2",
    });
    expect(params).toContainEqual({ name: "osc2Wavetable", value: "Sine" });
  });
});

describe("Wavetable pseudo-params — write", () => {
  it("writes filterRouting enum to index", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(
      device,
      "filterRouting",
      "split",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith("filter_routing", 2);
  });

  it("warns and skips invalid filterRouting", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(
      device,
      "filterRouting",
      "bogus",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("not a valid filterRouting"),
    );
  });

  it("writes monoPoly poly to index 1", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "monoPoly", "poly", "updateDevice");

    expect(device.set).toHaveBeenCalledWith("mono_poly", 1);
  });

  it("warns and skips invalid monoPoly", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "monoPoly", "stereo", "updateDevice");

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("not a valid monoPoly"),
    );
  });

  it("writes polyVoices integer", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "polyVoices", 16, "updateDevice");

    expect(device.set).toHaveBeenCalledWith("poly_voices", 16);
  });

  it("warns and skips non-integer polyVoices", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "polyVoices", 3.5, "updateDevice");

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("polyVoices"),
    );
  });

  it("writes unisonMode enum to index", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(
      device,
      "unisonMode",
      "phase-sync",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith("unison_mode", 4);
  });

  it("warns and skips invalid unisonMode", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "unisonMode", "unknown", "updateDevice");

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("not a valid unisonMode"),
    );
  });

  it("writes unisonVoiceCount integer", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "unisonVoiceCount", 8, "updateDevice");

    expect(device.set).toHaveBeenCalledWith("unison_voice_count", 8);
  });

  it("warns and skips non-integer unisonVoiceCount", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(
      device,
      "unisonVoiceCount",
      "abc",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("unisonVoiceCount"),
    );
  });

  it("writes osc1Engine in range and warns out of range", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "osc1Engine", 3, "updateDevice");

    expect(device.set).toHaveBeenCalledWith("oscillator_1_effect_mode", 3);

    const device2 = registerWavetable();

    applySpecializedParamWrite(device2, "osc1Engine", 4, "updateDevice");

    expect(device2.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("osc1Engine"),
    );
  });

  it("writes osc2Engine in range and warns out of range", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "osc2Engine", 0, "updateDevice");

    expect(device.set).toHaveBeenCalledWith("oscillator_2_effect_mode", 0);

    const device2 = registerWavetable();

    applySpecializedParamWrite(device2, "osc2Engine", -1, "updateDevice");

    expect(device2.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("osc2Engine"),
    );
  });

  it("writes osc1Category by name and warns on invalid", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "osc1Category", "Pads", "updateDevice");

    expect(device.set).toHaveBeenCalledWith(
      "oscillator_1_wavetable_category",
      2,
    );

    const device2 = registerWavetable();

    applySpecializedParamWrite(
      device2,
      "osc1Category",
      "Unknown",
      "updateDevice",
    );

    expect(device2.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("osc1Category"),
    );
  });

  it("writes osc2Category by name and warns on invalid", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "osc2Category", "Bass", "updateDevice");

    expect(device.set).toHaveBeenCalledWith(
      "oscillator_2_wavetable_category",
      1,
    );

    const device2 = registerWavetable();

    applySpecializedParamWrite(
      device2,
      "osc2Category",
      "NoSuch",
      "updateDevice",
    );

    expect(device2.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("osc2Category"),
    );
  });

  it("writes osc1Wavetable by name and warns on invalid", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(
      device,
      "osc1Wavetable",
      "Pulse",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith("oscillator_1_wavetable_index", 2);

    const device2 = registerWavetable();

    applySpecializedParamWrite(
      device2,
      "osc1Wavetable",
      "No Wave",
      "updateDevice",
    );

    expect(device2.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("osc1Wavetable"),
    );
  });

  it("writes osc2Wavetable by name and warns on invalid", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(
      device,
      "osc2Wavetable",
      "Triangle",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith("oscillator_2_wavetable_index", 1);

    const device2 = registerWavetable();

    applySpecializedParamWrite(
      device2,
      "osc2Wavetable",
      "No Wave",
      "updateDevice",
    );

    expect(device2.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("osc2Wavetable"),
    );
  });
});

describe("Wavetable actions — setModulation", () => {
  it("resolves target index and calls set_modulation_value", () => {
    const device = registerWavetable(
      {},
      buildModMethods(["Osc 1 Pos", "Filter Freq"]),
    );

    applySpecializedActions(
      device,
      ["setModulation('Osc 1 Pos', 0, 0.5)"],
      "updateDevice",
    );

    expect(device.call).toHaveBeenCalledWith("set_modulation_value", 0, 0, 0.5);
  });

  it("auto-adds missing target then calls set_modulation_value", () => {
    // Target list starts empty; add_parameter_to_modulation_matrix is called
    // first. After add, the second resolveTargetIndex pass finds the target.
    // Simulate by returning the target on subsequent calls.
    let addCalled = false;
    const device = registerWavetable(
      {},
      {
        ...buildModMethods([]),
        get_modulation_target_parameter_name: (i: unknown) => {
          if (addCalled && i === 0) return "Osc 1 Pos";

          return 1;
        },
        add_parameter_to_modulation_matrix: () => {
          addCalled = true;
        },
      },
    );

    applySpecializedActions(
      device,
      ["setModulation('Osc 1 Pos', 1, 0.25)"],
      "updateDevice",
    );

    expect(device.call).toHaveBeenCalledWith(
      "add_parameter_to_modulation_matrix",
      expect.anything(),
    );
    expect(device.call).toHaveBeenCalledWith(
      "set_modulation_value",
      0,
      1,
      0.25,
    );
  });

  it("warns and skips when target param cannot be found", () => {
    const device = registerWavetable({}, buildModMethods([]));

    applySpecializedActions(
      device,
      ["setModulation('Nonexistent', 0, 0.5)"],
      "updateDevice",
    );

    expect(device.call).not.toHaveBeenCalledWith(
      "set_modulation_value",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Nonexistent"),
    );
  });

  it("warns on source index out of range (13) and bad amount", () => {
    const device1 = registerWavetable({}, buildModMethods(["Volume"]));

    applySpecializedActions(
      device1,
      ["setModulation('Volume', 13, 0.5)"],
      "updateDevice",
    );

    expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining("source"));

    const device2 = registerWavetable({}, buildModMethods(["Volume"]));

    applySpecializedActions(
      device2,
      ["setModulation('Volume', 0, 'notanumber')"],
      "updateDevice",
    );

    expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining("amount"));
  });
});

describe("Wavetable actions — clearModulation", () => {
  it("calls set_modulation_value with 0 when target is present", () => {
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(
      device,
      ["clearModulation('Osc 1 Pos', 2)"],
      "updateDevice",
    );

    expect(device.call).toHaveBeenCalledWith("set_modulation_value", 0, 2, 0);
  });

  it("warns and skips when target is not in matrix", () => {
    const device = registerWavetable({}, buildModMethods([]));

    applySpecializedActions(
      device,
      ["clearModulation('Missing', 0)"],
      "updateDevice",
    );

    expect(device.call).not.toHaveBeenCalledWith(
      "set_modulation_value",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining("Missing"));
  });
});

describe("Wavetable actions — addModulationTarget", () => {
  it("calls add_parameter_to_modulation_matrix for a known param", () => {
    const device = registerWavetable({}, buildModMethods([]));

    applySpecializedActions(
      device,
      ["addModulationTarget('Osc 1 Pos')"],
      "updateDevice",
    );

    expect(device.call).toHaveBeenCalledWith(
      "add_parameter_to_modulation_matrix",
      expect.anything(),
    );
  });

  it("warns and skips when param is not found", () => {
    const device = registerWavetable({}, buildModMethods([]));

    applySpecializedActions(
      device,
      ["addModulationTarget('Unknown Param')"],
      "updateDevice",
    );

    expect(device.call).not.toHaveBeenCalledWith(
      "add_parameter_to_modulation_matrix",
      expect.anything(),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Unknown Param"),
    );
  });
});

describe("Wavetable readModulations", () => {
  it("returns nonzero cells as {target, source, amount}", () => {
    const device = registerWavetable(
      {},
      buildModMethods(["Osc 1 Pos", "Filter Freq"], {
        "0,3": 0.5,
        "1,7": -0.25,
      }),
    );

    expect(readSpecializedModulations(device)).toStrictEqual(
      expect.arrayContaining([
        { target: "Osc 1 Pos", source: 3, amount: 0.5 },
        { target: "Filter Freq", source: 7, amount: -0.25 },
      ]),
    );
  });

  it("stops at the sentinel and omits zero cells", () => {
    const device = registerWavetable(
      {},
      buildModMethods(["Volume"], { "0,0": 1.0 }),
    );
    const mods = readSpecializedModulations(device);

    const nameCalls = (device.call as Mock).mock.calls.filter(
      (c: unknown[]) => c[0] === "get_modulation_target_parameter_name",
    );

    // Sentinel reached at index 1 → exactly 2 calls (index 0 found, index 1 sentinel)
    expect(nameCalls).toHaveLength(2);
    expect(mods).toHaveLength(1);
  });

  it("returns empty array for empty matrix", () => {
    expect(
      readSpecializedModulations(registerWavetable({}, buildModMethods([]))),
    ).toStrictEqual([]);
  });
});

describe("Wavetable readOptions", () => {
  it("returns osc1Wavetables, osc2Wavetables, and modulatableParameters", () => {
    const device = registerWavetable(
      {},
      { ...buildModMethods([]), is_parameter_modulatable: () => 1 },
    );
    const options = readSpecializedOptions(device) as Record<string, unknown>;

    expect(options.osc1Wavetables).toStrictEqual(OSC1_WAVETABLES);
    expect(options.osc2Wavetables).toStrictEqual(OSC2_WAVETABLES);
    expect(options.modulatableParameters).toStrictEqual([
      "Osc 1 Pos",
      "Filter Freq",
      "Volume",
    ]);
  });

  it("excludes non-modulatable parameters", () => {
    const device = registerWavetable(
      {},
      { ...buildModMethods([]), is_parameter_modulatable: () => 0 },
    );

    expect(
      (readSpecializedOptions(device) as Record<string, unknown>)
        .modulatableParameters,
    ).toStrictEqual([]);
  });
});

// Integration via read-device tool
describe("Wavetable via read-device", () => {
  /**
   * Register a fully-readable Wavetable device for read-device integration.
   * @param properties - Property overrides
   * @param methods - Method overrides
   */
  function registerReadableWavetable(
    properties: Record<string, unknown> = {},
    methods: Record<string, (...args: unknown[]) => unknown> = {},
  ): void {
    registerMockObject("wt-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        name: "Wavetable",
        class_display_name: "Wavetable",
        type: 1,
        can_have_chains: 0,
        can_have_drum_pads: 0,
        is_active: 1,
        parameters: PARAM_IDS,
        filter_routing: 0,
        mono_poly: 0,
        poly_voices: 8,
        unison_mode: 1,
        unison_voice_count: 2,
        oscillator_1_effect_mode: 0,
        oscillator_2_effect_mode: 0,
        oscillator_1_wavetable_category: 0,
        oscillator_2_wavetable_category: 1,
        oscillator_1_wavetable_index: 1,
        oscillator_2_wavetable_index: 0,
        oscillator_wavetable_categories: [OSC_CATEGORIES],
        oscillator_1_wavetables: [OSC1_WAVETABLES],
        oscillator_2_wavetables: [OSC2_WAVETABLES],
        ...properties,
      },
      methods: {
        ...buildModMethods(["Osc 1 Pos"], { "0,2": 0.3 }),
        ...methods,
      },
    });

    registerMockObject("p1", { properties: { name: "Osc 1 Pos" } });
    registerMockObject("p2", { properties: { name: "Filter Freq" } });
    registerMockObject("p3", { properties: { name: "Volume" } });
  }

  it("includes pseudo-params and modulations when include contains params", () => {
    registerReadableWavetable();

    const result = readDevice({ deviceId: "wt-1", include: ["params"] });

    expect(result.parameters).toContainEqual({
      name: "filterRouting",
      value: "serial",
    });
    expect(result.parameters).toContainEqual({
      name: "osc1Wavetable",
      value: "Saw Dual 2",
    });
    expect(result.parameters).toContainEqual({
      name: "osc2Category",
      value: "Bass",
    });
    expect(result.modulations).toBeDefined();
    expect(result.modulations).toStrictEqual(
      expect.arrayContaining([{ target: "Osc 1 Pos", source: 2, amount: 0.3 }]),
    );
  });

  it("includes options when include contains options", () => {
    registerReadableWavetable(
      {},
      { ...buildModMethods([]), is_parameter_modulatable: () => 1 },
    );

    const result = readDevice({
      deviceId: "wt-1",
      include: ["params", "options"],
    });
    const opts = result.options as Record<string, unknown>;

    expect(opts.osc1Wavetables).toStrictEqual(OSC1_WAVETABLES);
    expect(opts.osc2Wavetables).toStrictEqual(OSC2_WAVETABLES);
    expect(Array.isArray(opts.modulatableParameters)).toBe(true);
  });
});
