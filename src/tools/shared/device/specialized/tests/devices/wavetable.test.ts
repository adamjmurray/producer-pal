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
} from "../../specialized-device-registry.ts";
import {
  buildModMethods,
  expectModulationNotSet,
  OSC1_WAVETABLES,
  OSC2_WAVETABLES,
  OSC_CATEGORIES,
  PARAM_IDS,
  registerStandardParamMocks,
  registerWavetable,
} from "./wavetable-test-helpers.ts";

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

  it("maps polyVoices index to its voice count and reads unisonVoiceCount raw", () => {
    // poly_voices is an index into [2,3,4,5,6,7,8,16]; index 7 → 16 voices.
    const params = readSpecializedParams(
      registerWavetable({ poly_voices: 7, unison_voice_count: 4 }),
    );

    expect(params).toContainEqual({ name: "polyVoices", value: 16 });
    expect(params).toContainEqual({ name: "unisonVoiceCount", value: 4 });
  });

  it("reads unisonMode enum", () => {
    expect(
      readSpecializedParams(registerWavetable({ unison_mode: 3 })),
    ).toContainEqual({ name: "unisonMode", value: "noise" });
  });

  it("reads osc1Engine and osc2Engine as enum labels", () => {
    const device = registerWavetable({
      oscillator_1_effect_mode: 2,
      oscillator_2_effect_mode: 1,
    });
    const params = readSpecializedParams(device);

    expect(params).toContainEqual({ name: "osc1Engine", value: "Classic" });
    expect(params).toContainEqual({ name: "osc2Engine", value: "Fm" });
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

  it("writes polyVoices count as its catalog index", () => {
    const device = registerWavetable();

    // 16 voices is the last catalog entry → index 7.
    applySpecializedParamWrite(device, "polyVoices", 16, "updateDevice");
    expect(device.set).toHaveBeenCalledWith("poly_voices", 7);

    // 5 voices → index 3.
    (device.set as Mock).mockClear();

    applySpecializedParamWrite(device, "polyVoices", 5, "updateDevice");
    expect(device.set).toHaveBeenCalledWith("poly_voices", 3);
  });

  it("warns and skips polyVoices not in the catalog", () => {
    const device = registerWavetable();

    // 10 is a plausible-looking count but not a valid Wavetable option.
    applySpecializedParamWrite(device, "polyVoices", 10, "updateDevice");

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

  it("writes unisonVoiceCount as a raw count within range", () => {
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

  it("maps osc engine labels to indices and warns on an invalid label", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "osc1Engine", "Modern", "updateDevice");
    applySpecializedParamWrite(device, "osc2Engine", "Fm", "updateDevice");

    expect(device.set).toHaveBeenCalledWith("oscillator_1_effect_mode", 3);
    expect(device.set).toHaveBeenCalledWith("oscillator_2_effect_mode", 1);

    (device.set as Mock).mockClear();

    applySpecializedParamWrite(
      device,
      "osc1Engine",
      "Wavefold",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("osc1Engine"),
    );
  });

  it("writes osc1Category by name and warns on invalid", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "osc1Category", "Pads", "updateDevice");

    expect(device.set).toHaveBeenCalledWith(
      "oscillator_1_wavetable_category",
      2,
    );

    (device.set as Mock).mockClear();

    applySpecializedParamWrite(
      device,
      "osc1Category",
      "Unknown",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
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

    (device.set as Mock).mockClear();

    applySpecializedParamWrite(
      device,
      "osc2Category",
      "NoSuch",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
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

    (device.set as Mock).mockClear();

    applySpecializedParamWrite(
      device,
      "osc1Wavetable",
      "No Wave",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
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

    (device.set as Mock).mockClear();

    applySpecializedParamWrite(
      device,
      "osc2Wavetable",
      "No Wave",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("osc2Wavetable"),
    );
  });

  // The first entry in each list is a real choice, so the not-found guard must
  // reject only index < 0 — treating index 0 as "not found" would make the
  // first category / wavetable unselectable.
  it("writes the first category in the list (index 0)", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(
      device,
      "osc1Category",
      "Basic Shapes",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith(
      "oscillator_1_wavetable_category",
      0,
    );
  });

  it("writes the first wavetable in the list (index 0)", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(
      device,
      "osc1Wavetable",
      "Saw Dual 1",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith("oscillator_1_wavetable_index", 0);
  });

  it("lists the available categories and wavetables when a name is unknown", () => {
    const device = registerWavetable();

    applySpecializedParamWrite(device, "osc1Category", "Nope", "updateDevice");
    applySpecializedParamWrite(device, "osc1Wavetable", "Nope", "updateDevice");

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        `not a valid osc1Category. Available: ${OSC_CATEGORIES.join(", ")}`,
      ),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        `not a valid osc1Wavetable. Available: ${OSC1_WAVETABLES.join(", ")}`,
      ),
    );
  });
});

describe("Wavetable actions — setModulation", () => {
  it("resolves a case-mangled target past the first slot and a source by name", () => {
    // Second-slot target exercises the resolve loop's continue path; the
    // case-insensitive target name "FILTER freq" and source "lfo 1" both
    // resolve (target matches "Filter Freq", source → column index 3).
    const device = registerWavetable(
      {},
      buildModMethods(["Osc 1 Pos", "Filter Freq"]),
    );

    applySpecializedActions(
      device,
      ["setModulation('FILTER freq', lfo 1, 0.5)"],
      "updateDevice",
    );

    expect(device.call).toHaveBeenCalledWith("set_modulation_value", 1, 3, 0.5);
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

  it.each([
    ["param missing", "Nonexistent", 1, "Nonexistent"],
    // is_parameter_modulatable returns 0: param exists but mod isn't supported.
    ["param not modulatable", "Osc 1 Pos", 0, "not modulatable"],
  ])("warns and skips setModulation when %s", (_, target, mod, msg) => {
    const device = registerWavetable({}, buildModMethods([], {}, mod as 0 | 1));

    applySpecializedActions(
      device,
      [`setModulation('${target}', 0, 0.5)`],
      "updateDevice",
    );

    expectModulationNotSet(device, msg);
  });

  it.each([
    ["source 13 out of range", "('Volume', 13, 0.5)", "source"],
    ["amount NaN", "('Volume', 0, 'notanumber')", "amount"],
    ["amount > 1", "('Volume', 0, 5)", "amount must be in -1..1"],
    ["amount < -1", "('Volume', 0, -2)", "amount must be in -1..1"],
  ])("warns and skips invalid setModulation: %s", (_, args, msg) => {
    const device = registerWavetable({}, buildModMethods(["Volume"]));

    applySpecializedActions(device, [`setModulation${args}`], "updateDevice");
    expectModulationNotSet(device, msg);
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

    expectModulationNotSet(device, "Missing");
  });

  it("warns on a source index out of range", () => {
    const device = registerWavetable({}, buildModMethods(["Osc 1 Pos"]));

    applySpecializedActions(
      device,
      ["clearModulation('Osc 1 Pos', 13)"],
      "updateDevice",
    );

    expectModulationNotSet(device, "clearModulation source");
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

  it.each([
    ["not found", "Unknown Param", 1, "Unknown Param"],
    // is_parameter_modulatable returns 0: param exists but mod isn't supported.
    ["not modulatable", "Osc 1 Pos", 0, "not modulatable"],
  ])(
    "warns and skips addModulationTarget when param is %s",
    (_, name, mod, msg) => {
      const device = registerWavetable(
        {},
        buildModMethods([], {}, mod as 0 | 1),
      );

      applySpecializedActions(
        device,
        [`addModulationTarget('${name}')`],
        "updateDevice",
      );

      expect(device.call).not.toHaveBeenCalledWith(
        "add_parameter_to_modulation_matrix",
        expect.anything(),
      );
      expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining(msg));
    },
  );
});

describe("Wavetable actions — argument validation", () => {
  it.each([
    ["setModulation('Volume')", "setModulation requires 3 arguments"],
    ["clearModulation('Volume')", "clearModulation requires 2 arguments"],
    ["addModulationTarget()", "addModulationTarget requires 1 argument"],
  ])("warns when %s has too few arguments", (action, message) => {
    const device = registerWavetable({}, buildModMethods(["Volume"]));

    applySpecializedActions(device, [action], "updateDevice");

    expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining(message));
  });

  it("warns when a found target still cannot be added to the matrix", () => {
    // 'Volume' exists as a param child, but the (no-op) add never registers it,
    // so the re-resolve still fails → "could not add to matrix".
    const device = registerWavetable({}, buildModMethods([]));

    applySpecializedActions(
      device,
      ["setModulation('Volume', 0, 0.5)"],
      "updateDevice",
    );

    expect(device.call).toHaveBeenCalledWith(
      "add_parameter_to_modulation_matrix",
      expect.anything(),
    );
    expect(device.call).not.toHaveBeenCalledWith(
      "set_modulation_value",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("could not add to matrix"),
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
        { target: "Osc 1 Pos", source: "LFO 1", amount: 0.5 },
        { target: "Filter Freq", source: "PB", amount: -0.25 },
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

    expect(options.oscWavetableCategories).toStrictEqual(OSC_CATEGORIES);
    expect(options.osc1Wavetables).toStrictEqual(OSC1_WAVETABLES);
    expect(options.osc2Wavetables).toStrictEqual(OSC2_WAVETABLES);
    expect(options.modulatableParameters).toStrictEqual([
      "Osc 1 Pos",
      "Filter Freq",
      "Volume",
    ]);
    // Static paramOptions merge alongside the dynamic catalogs; mod-matrix
    // source names (for the setModulation action) are discoverable too.
    expect(options.paramOptions).toHaveProperty("filterRouting");
    expect(options.modulationSources).toContain("LFO 1");
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
        poly_voices: 3,
        unison_mode: 1,
        unison_voice_count: 2,
        oscillator_1_effect_mode: 0,
        oscillator_2_effect_mode: 0,
        oscillator_1_wavetable_category: 0,
        oscillator_2_wavetable_category: 1,
        oscillator_1_wavetable_index: 1,
        oscillator_2_wavetable_index: 0,
        oscillator_wavetable_categories: OSC_CATEGORIES,
        oscillator_1_wavetables: OSC1_WAVETABLES,
        oscillator_2_wavetables: OSC2_WAVETABLES,
        ...properties,
      },
      methods: {
        ...buildModMethods(["Osc 1 Pos"], { "0,2": 0.3 }),
        ...methods,
      },
    });

    registerStandardParamMocks();
  }

  it("includes pseudo-params without the modulation scan when include is params", () => {
    registerReadableWavetable();

    const result = readDevice({ id: "wt-1", include: ["params"] });

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
    // The mod-matrix scan is opt-in via "options" to avoid its per-read cost.
    expect(result.modulations).toBeUndefined();
  });

  it("includes options and modulations when include contains options", () => {
    registerReadableWavetable({}, { is_parameter_modulatable: () => 1 });

    const result = readDevice({
      id: "wt-1",
      include: ["params", "options"],
    });
    const opts = result.options as Record<string, unknown>;

    expect(opts.osc1Wavetables).toStrictEqual(OSC1_WAVETABLES);
    expect(opts.osc2Wavetables).toStrictEqual(OSC2_WAVETABLES);
    expect(Array.isArray(opts.modulatableParameters)).toBe(true);
    expect(result.modulations).toStrictEqual(
      expect.arrayContaining([
        { target: "Osc 1 Pos", source: "Env 3", amount: 0.3 },
      ]),
    );
  });
});
