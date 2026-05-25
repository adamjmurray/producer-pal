// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  applySpecializedActions,
  applySpecializedParamWrite,
  getSpecForDevice,
  readSpecializedActions,
  readSpecializedModulations,
  readSpecializedOptions,
  readSpecializedParams,
} from "../specialized-device-registry.ts";

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
  it("returns an empty object for a device without dynamic catalogs", () => {
    const device = registerDevice("Roar", { routing_mode_index: 0 });

    expect(readSpecializedOptions(device)).toStrictEqual({});
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
