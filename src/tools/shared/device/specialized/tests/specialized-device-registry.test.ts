// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { driftSpec } from "../devices/drift.ts";
import { wavetableSpec } from "../devices/wavetable.ts";
import {
  applyInactiveStates,
  exclusiveModes,
} from "../specialized-device-inactive.ts";
import {
  applySpecializedActions,
  applySpecializedInactiveStates,
  applySpecializedParamWrite,
  getSpecForDevice,
  readSpecializedActions,
  readSpecializedModulations,
  readSpecializedOptions,
  readSpecializedParams,
} from "../specialized-device-registry.ts";
import { type InactiveWhenRule } from "../specialized-device-types.ts";

/**
 * Register a mock device with a given class_display_name.
 * @param displayName - The device's class_display_name
 * @param properties - Additional property overrides
 * @returns The device LiveAPI
 */
function registerDevice(
  displayName: string,
  properties: Record<string, unknown> = {},
): LiveAPI {
  registerMockObject("dev-1", {
    type: "Device",
    properties: { class_display_name: displayName, ...properties },
  });

  return LiveAPI.from("id dev-1");
}

/**
 * Look up a param entry by name in a parameters array.
 * @param params - Parameter entries
 * @param name - Param name to find
 * @returns The matching entry
 */
function param(
  params: Record<string, unknown>[],
  name: string,
): Record<string, unknown> {
  const found = params.find((p) => p.name === name);

  if (found == null) throw new Error(`param not found: ${name}`);

  return found;
}

describe("getSpecForDevice", () => {
  it("returns the spec for a recognized device", () => {
    const device = registerDevice("Roar");

    expect(getSpecForDevice(device)?.displayNames).toContain("Roar");
  });

  it("returns undefined for a generic device", () => {
    const device = registerDevice("Operator");

    expect(getSpecForDevice(device)).toBeUndefined();
  });
});

describe("applySpecializedParamWrite", () => {
  it("returns false for a generic device", () => {
    const device = registerDevice("Operator");

    expect(applySpecializedParamWrite(device, "foo", 1, "t")).toBe(false);
  });

  it("returns false for an unknown key on a specialized device", () => {
    const device = registerDevice("Roar", { routing_mode_index: 0 });

    expect(applySpecializedParamWrite(device, "notAParam", 1, "t")).toBe(false);
  });

  it("returns true and applies a recognized pseudo-param", () => {
    const device = registerDevice("Roar", { routing_mode_index: 0 });

    expect(
      applySpecializedParamWrite(device, "routingMode", "serial", "t"),
    ).toBe(true);
    expect(device.set).toHaveBeenCalledWith("routing_mode_index", 1);
  });
});

describe("readSpecializedParams", () => {
  it("returns an empty array for a generic device", () => {
    const device = registerDevice("Operator");

    expect(readSpecializedParams(device)).toStrictEqual([]);
  });

  it("filters entries by a case-insensitive search term", () => {
    const device = registerDevice("Roar", {
      routing_mode_index: 1,
      env_listen: 1,
    });

    expect(readSpecializedParams(device, "env")).toStrictEqual([
      { name: "envListen", value: true },
    ]);
  });
});

describe("applySpecializedActions", () => {
  it("dispatches a recognized action", () => {
    registerMockObject("simpler-1", {
      type: "SimplerDevice",
      properties: { class_display_name: "Simpler" },
    });
    const device = LiveAPI.from("id simpler-1");

    applySpecializedActions(device, ["reverse"], "updateDevice");

    expect(device.call).toHaveBeenCalledWith("reverse");
  });

  it("warns on an unparseable action", () => {
    const device = registerDevice("Simpler");

    applySpecializedActions(device, ["1bad("], "updateDevice");

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("could not parse action"),
    );
  });

  it("warns on an unknown action for the device", () => {
    const device = registerDevice("Simpler");

    applySpecializedActions(device, ["doesNotExist"], "updateDevice");

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("unknown action"),
    );
  });

  it("warns on an action for a generic device (no spec)", () => {
    const device = registerDevice("Operator");

    applySpecializedActions(device, ["reverse"], "updateDevice");

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("unknown action"),
    );
  });

  it("warns on an action for a device whose spec defines none", () => {
    const device = registerDevice("Roar", { routing_mode_index: 0 });

    applySpecializedActions(device, ["reverse"], "updateDevice");

    expect(device.call).not.toHaveBeenCalledWith("reverse");
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("unknown action"),
    );
  });
});

describe("readSpecializedActions", () => {
  it("returns Simpler actions with signature and description", () => {
    const device = registerDevice("Simpler");
    const actions = readSpecializedActions(device);

    expect(actions.map((a) => a.name)).toStrictEqual([
      "reverse",
      "crop",
      "warpDouble",
      "warpHalf",
      "warpAs",
    ]);
    expect(actions).toContainEqual({
      name: "warpAs",
      signature: "warpAs(beats)",
      description: "Warp the active region to span the given number of beats",
    });
  });

  it("returns Wavetable mod-matrix actions", () => {
    const device = registerDevice("Wavetable");

    expect(readSpecializedActions(device).map((a) => a.name)).toStrictEqual([
      "setModulation",
      "clearModulation",
      "addModulationTarget",
    ]);
  });

  it("returns an empty array for a specialized device with no actions", () => {
    const device = registerDevice("Roar", { routing_mode_index: 0 });

    expect(readSpecializedActions(device)).toStrictEqual([]);
  });

  it("returns an empty array for a generic device", () => {
    const device = registerDevice("Operator");

    expect(readSpecializedActions(device)).toStrictEqual([]);
  });
});

describe("readSpecializedOptions", () => {
  it("returns paramOptions (static valid values) for a device with no dynamic catalogs", () => {
    const device = registerDevice("Roar", { routing_mode_index: 0 });

    expect(readSpecializedOptions(device)).toStrictEqual({
      paramOptions: {
        routingMode: [
          "single",
          "serial",
          "parallel",
          "multi-band",
          "mid-side",
          "feedback",
          "delay",
        ],
      },
    });
  });

  it("omits booleans and other option-less params from paramOptions", () => {
    // Roar's envListen is a boolean with no `options`, so it must not appear.
    const device = registerDevice("Roar", { routing_mode_index: 0 });
    const { paramOptions } = readSpecializedOptions(device) as {
      paramOptions: Record<string, unknown>;
    };

    expect(paramOptions).not.toHaveProperty("envListen");
  });

  it("returns an empty object for a generic device", () => {
    const device = registerDevice("Operator");

    expect(readSpecializedOptions(device)).toStrictEqual({});
  });
});

describe("readSpecializedModulations", () => {
  it("returns undefined for a device without a mod matrix", () => {
    const device = registerDevice("Roar", { routing_mode_index: 0 });

    expect(readSpecializedModulations(device)).toBeUndefined();
  });
});

describe("applyInactiveStates", () => {
  const BINARY_RULE: InactiveWhenRule[] = [
    {
      controller: "LFO 1 Sync",
      cases: { Free: ["LFO 1 S. Rate"], Tempo: ["LFO 1 Rate"] },
    },
  ];

  /**
   * Build a Wavetable-like LFO 1 param trio with a given sync value.
   * @param sync - "Free" or "Tempo"
   * @returns Parameter entries
   */
  function lfo1(sync: string): Record<string, unknown>[] {
    return [
      { name: "LFO 1 Sync", value: sync },
      { name: "LFO 1 Rate", value: 1.49, unit: "Hz" },
      { name: "LFO 1 S. Rate", value: "1/8" },
    ];
  }

  it("marks the synced note-value rate inactive in Free mode", () => {
    const params = lfo1("Free");

    applyInactiveStates(BINARY_RULE, params);

    expect(param(params, "LFO 1 S. Rate").state).toBe("inactive");
    expect(param(params, "LFO 1 Rate").state).toBeUndefined();
  });

  it("marks the free-running Hz rate inactive in Tempo mode", () => {
    const params = lfo1("Tempo");

    applyInactiveStates(BINARY_RULE, params);

    expect(param(params, "LFO 1 Rate").state).toBe("inactive");
    expect(param(params, "LFO 1 S. Rate").state).toBeUndefined();
  });

  it("no-ops when the controller param is absent (e.g. search-filtered)", () => {
    const params = [
      { name: "LFO 1 Rate", value: 1.49 },
      { name: "LFO 1 S. Rate", value: "1/8" },
    ];

    applyInactiveStates(BINARY_RULE, params);

    expect(param(params, "LFO 1 Rate").state).toBeUndefined();
    expect(param(params, "LFO 1 S. Rate").state).toBeUndefined();
  });

  it("no-ops when the controller value has no case entry", () => {
    const params = lfo1("Bogus");

    applyInactiveStates(BINARY_RULE, params);

    expect(param(params, "LFO 1 Rate").state).toBeUndefined();
    expect(param(params, "LFO 1 S. Rate").state).toBeUndefined();
  });

  it("never overrides a state Live already set", () => {
    const params = lfo1("Tempo");

    param(params, "LFO 1 Rate").state = "disabled";
    applyInactiveStates(BINARY_RULE, params);

    expect(param(params, "LFO 1 Rate").state).toBe("disabled");
  });

  it("tolerates a case naming a param not present in the list", () => {
    const params = [{ name: "LFO 1 Sync", value: "Tempo" }];

    expect(() => applyInactiveStates(BINARY_RULE, params)).not.toThrow();
  });

  it("ignores entries without a string name", () => {
    const params: Record<string, unknown>[] = [
      { value: "orphan" },
      ...lfo1("Tempo"),
    ];

    applyInactiveStates(BINARY_RULE, params);

    expect(param(params, "LFO 1 Rate").state).toBe("inactive");
  });
});

describe("exclusiveModes", () => {
  it("lists every other group param inactive for each controller value", () => {
    const rule = exclusiveModes("Mode", { A: "pA", B: "pB", C: "pC" });

    expect(rule).toStrictEqual({
      controller: "Mode",
      cases: {
        A: ["pB", "pC"],
        B: ["pA", "pC"],
        C: ["pA", "pB"],
      },
    });
  });
});

describe("wavetableSpec.inactiveWhen (real rule data)", () => {
  /**
   * Build both Wavetable LFO param trios with given sync values.
   * @param sync1 - LFO 1 sync value
   * @param sync2 - LFO 2 sync value
   * @returns Parameter entries
   */
  function lfos(sync1: string, sync2: string): Record<string, unknown>[] {
    return [
      { name: "LFO 1 Sync", value: sync1 },
      { name: "LFO 1 Rate", value: 1.49 },
      { name: "LFO 1 S. Rate", value: "1/8" },
      { name: "LFO 2 Sync", value: sync2 },
      { name: "LFO 2 Rate", value: 1 },
      { name: "LFO 2 S. Rate", value: "1/8" },
    ];
  }

  it("handles each LFO independently per its own Sync", () => {
    const rules = wavetableSpec.inactiveWhen;

    expect(rules).toBeDefined();

    const params = lfos("Tempo", "Free");

    applyInactiveStates(rules as InactiveWhenRule[], params);

    expect(param(params, "LFO 1 Rate").state).toBe("inactive");
    expect(param(params, "LFO 1 S. Rate").state).toBeUndefined();
    expect(param(params, "LFO 2 S. Rate").state).toBe("inactive");
    expect(param(params, "LFO 2 Rate").state).toBeUndefined();
  });
});

describe("driftSpec.inactiveWhen (real rule data)", () => {
  const RATE_PARAMS = ["LFO Rate", "LFO Time", "LFO Ratio", "LFO Synced"];

  /**
   * Build Drift LFO mode + four rate params for a given Time Mode.
   * @param mode - "Freq" | "Time" | "Ratio" | "Sync"
   * @returns Parameter entries
   */
  function driftLfo(mode: string): Record<string, unknown>[] {
    return [
      { name: "LFO Time Mode", value: mode },
      { name: "LFO Rate", value: 0.4 },
      { name: "LFO Time", value: 1000 },
      { name: "LFO Ratio", value: 1 },
      { name: "LFO Synced", value: "1/8" },
    ];
  }

  it.each([
    ["Freq", "LFO Rate"],
    ["Time", "LFO Time"],
    ["Ratio", "LFO Ratio"],
    ["Sync", "LFO Synced"],
  ])("leaves only the %s-mode param active (%s)", (mode, activeName) => {
    const params = driftLfo(mode);

    applyInactiveStates(driftSpec.inactiveWhen as InactiveWhenRule[], params);

    for (const name of RATE_PARAMS) {
      const expected = name === activeName ? undefined : "inactive";

      expect(param(params, name).state).toBe(expected);
    }
  });
});

describe("applySpecializedInactiveStates", () => {
  it("applies a recognized device's rules", () => {
    const device = registerDevice("Wavetable");
    const params = [
      { name: "LFO 1 Sync", value: "Tempo" },
      { name: "LFO 1 Rate", value: 1.49 },
      { name: "LFO 1 S. Rate", value: "1/8" },
    ];

    applySpecializedInactiveStates(device, params);

    expect(param(params, "LFO 1 Rate").state).toBe("inactive");
  });

  it("no-ops for a generic device with no spec", () => {
    const device = registerDevice("Operator");
    const params = [
      { name: "LFO 1 Sync", value: "Tempo" },
      { name: "LFO 1 Rate", value: 1.49 },
    ];

    applySpecializedInactiveStates(device, params);

    expect(param(params, "LFO 1 Rate").state).toBeUndefined();
  });
});
