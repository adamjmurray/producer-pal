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
} from "../../specialized-device-registry.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/**
 * Register a mock EQ Eight device and return its LiveAPI.
 * @param properties - Property overrides (merged onto EQ Eight defaults)
 * @returns The EQ Eight LiveAPI object
 */
function registerEqEight(properties: Record<string, unknown> = {}): LiveAPI {
  registerMockObject("eq8-1", {
    type: "Eq8Device",
    properties: {
      class_display_name: "EQ Eight",
      global_mode: 0,
      oversample: 0,
      ...properties,
    },
  });

  return LiveAPI.from("id eq8-1");
}

describe("EQ Eight pseudo-params", () => {
  describe("read", () => {
    it("reads globalMode stereo (index 0)", () => {
      const device = registerEqEight({ global_mode: 0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "globalMode",
        value: "stereo",
      });
    });

    it("reads globalMode L/R (index 1)", () => {
      const device = registerEqEight({ global_mode: 1 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "globalMode",
        value: "L/R",
      });
    });

    it("reads globalMode M/S (index 2)", () => {
      const device = registerEqEight({ global_mode: 2 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "globalMode",
        value: "M/S",
      });
    });

    it("reads oversample true", () => {
      const device = registerEqEight({ oversample: 1 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "oversample",
        value: true,
      });
    });

    it("reads oversample false", () => {
      const device = registerEqEight({ oversample: 0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "oversample",
        value: false,
      });
    });

    it("reads both globalMode and oversample", () => {
      const device = registerEqEight({ global_mode: 2, oversample: 1 });

      expect(readSpecializedParams(device)).toStrictEqual([
        { name: "globalMode", value: "M/S" },
        { name: "oversample", value: true },
      ]);
    });
  });

  describe("write globalMode", () => {
    it("maps stereo label to index 0", () => {
      const device = registerEqEight({ global_mode: 2 });

      applySpecializedParamWrite(
        device,
        "globalMode",
        "stereo",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith("global_mode", 0);
    });

    it("maps L/R label to index 1", () => {
      const device = registerEqEight();

      applySpecializedParamWrite(device, "globalMode", "L/R", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("global_mode", 1);
    });

    it("maps M/S label to index 2", () => {
      const device = registerEqEight();

      applySpecializedParamWrite(device, "globalMode", "M/S", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("global_mode", 2);
    });

    it("warns and skips an invalid globalMode", () => {
      const device = registerEqEight();

      applySpecializedParamWrite(device, "globalMode", "bogus", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("not a valid globalMode"),
      );
    });

    it("is case-insensitive on the param name", () => {
      const device = registerEqEight();

      applySpecializedParamWrite(
        device,
        "globalmode",
        "stereo",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith("global_mode", 0);
    });
  });

  describe("write oversample", () => {
    it("writes 1 for true", () => {
      const device = registerEqEight();

      applySpecializedParamWrite(device, "oversample", "true", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("oversample", 1);
    });

    it("writes 0 for false", () => {
      const device = registerEqEight({ oversample: 1 });

      applySpecializedParamWrite(device, "oversample", "false", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("oversample", 0);
    });

    it("warns naming oversample and skips uninterpretable input", () => {
      const device = registerEqEight();

      applySpecializedParamWrite(device, "oversample", "maybe", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(
          '"maybe" is not a valid oversample (expected true/false)',
        ),
      );
    });
  });
});

// Integration through the read-device tool: confirms pseudo-params surface in
// the `parameters` output and that EQ Eight contributes no modulations/options.
describe("EQ Eight via read-device", () => {
  /**
   * Register a fully-readable mock EQ Eight device by ID.
   * @param properties - Property overrides
   */
  function registerReadableEqEight(
    properties: Record<string, unknown> = {},
  ): void {
    registerMockObject("eq8-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        name: "EQ Eight",
        class_display_name: "EQ Eight",
        type: 2,
        can_have_chains: 0,
        can_have_drum_pads: 0,
        is_active: 1,
        parameters: [],
        global_mode: 1,
        oversample: 0,
        ...properties,
      },
    });
  }

  it("includes pseudo-params in parameters and omits modulations", () => {
    registerReadableEqEight();

    const result = readDevice({ id: "eq8-1", include: ["params"] });

    expect(result.parameters).toStrictEqual([
      { name: "globalMode", value: "L/R" },
      { name: "oversample", value: false },
    ]);
    expect(result.modulations).toBeUndefined();
  });

  it("surfaces pseudo-param valid values under options.paramOptions", () => {
    registerReadableEqEight();

    const result = readDevice({ id: "eq8-1", include: ["options"] });

    expect(
      (result.options as Record<string, unknown>).paramOptions,
    ).toStrictEqual({ globalMode: ["stereo", "L/R", "M/S"] });
  });
});
