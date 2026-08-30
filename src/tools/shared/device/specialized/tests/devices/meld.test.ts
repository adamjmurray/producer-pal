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
import { registerMonoPolyWriteTests } from "../mono-poly-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/**
 * Register a mock Meld device and return its LiveAPI.
 * @param properties - Property overrides (merged onto Meld defaults)
 * @returns The Meld LiveAPI object
 */
function registerMeld(properties: Record<string, unknown> = {}): LiveAPI {
  registerMockObject("meld-1", {
    type: "MeldDevice",
    properties: {
      class_display_name: "Meld",
      mono_poly: 0,
      poly_voices: 1,
      unison_voices: 0,
      ...properties,
    },
  });

  return LiveAPI.from("id meld-1");
}

describe("Meld pseudo-params", () => {
  describe("read", () => {
    it("reads monoPoly as mono when mono_poly is 0", () => {
      const device = registerMeld({ mono_poly: 0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "monoPoly",
        value: "mono",
      });
    });

    it("reads monoPoly as poly when mono_poly is 1", () => {
      const device = registerMeld({ mono_poly: 1 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "monoPoly",
        value: "poly",
      });
    });

    it("reads polyVoices as a numeric value", () => {
      const device = registerMeld({ poly_voices: 4 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "polyVoices",
        value: 4,
      });
    });

    it("reads unisonVoices as a numeric value", () => {
      const device = registerMeld({ unison_voices: 2 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "unisonVoices",
        value: 2,
      });
    });

    it("reads all three params together", () => {
      const device = registerMeld({
        mono_poly: 1,
        poly_voices: 3,
        unison_voices: 1,
      });

      expect(readSpecializedParams(device)).toStrictEqual([
        { name: "monoPoly", value: "poly" },
        { name: "polyVoices", value: 3 },
        { name: "unisonVoices", value: 1 },
      ]);
    });
  });

  registerMonoPolyWriteTests(registerMeld);

  describe("write polyVoices", () => {
    it("sets poly_voices when value is in range", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "polyVoices", 4, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("poly_voices", 4);
    });

    it("sets poly_voices at the minimum boundary (1)", () => {
      const device = registerMeld({ poly_voices: 3 });

      applySpecializedParamWrite(device, "polyVoices", 1, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("poly_voices", 1);
    });

    it("sets poly_voices at the maximum boundary (6)", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "polyVoices", 6, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("poly_voices", 6);
    });

    it("warns and skips when polyVoices is above range (7)", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "polyVoices", 7, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("polyVoices"),
      );
    });

    it("warns and skips when polyVoices is below range (0)", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "polyVoices", 0, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("polyVoices"),
      );
    });
  });

  describe("write unisonVoices", () => {
    it("sets unison_voices when value is in range", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "unisonVoices", 2, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("unison_voices", 2);
    });

    it("sets unison_voices at the minimum boundary (0)", () => {
      const device = registerMeld({ unison_voices: 1 });

      applySpecializedParamWrite(device, "unisonVoices", 0, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("unison_voices", 0);
    });

    it("sets unison_voices at the maximum boundary (2)", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "unisonVoices", 2, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("unison_voices", 2);
    });

    it("warns and skips when unisonVoices is above range (3)", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "unisonVoices", 3, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("unisonVoices"),
      );
    });

    it("warns and skips when unisonVoices is a non-integer", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "unisonVoices", 1.5, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("unisonVoices"),
      );
    });
  });
});

// Integration through the read-device tool: confirms pseudo-params surface in
// the `parameters` output and that Meld contributes no modulations/options.
describe("Meld via read-device", () => {
  /**
   * Register a fully-readable mock Meld instrument by ID.
   * @param properties - Property overrides
   */
  function registerReadableMeld(
    properties: Record<string, unknown> = {},
  ): void {
    registerMockObject("meld-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        name: "Meld",
        class_display_name: "Meld",
        type: 1,
        can_have_chains: 0,
        can_have_drum_pads: 0,
        is_active: 1,
        parameters: [],
        mono_poly: 0,
        poly_voices: 3,
        unison_voices: 1,
        ...properties,
      },
    });
  }

  it("includes pseudo-params in parameters and omits modulations", () => {
    registerReadableMeld();

    const result = readDevice({ id: "meld-1", include: ["params"] });

    expect(result.parameters).toStrictEqual([
      { name: "monoPoly", value: "mono" },
      { name: "polyVoices", value: 3 },
      { name: "unisonVoices", value: 1 },
    ]);
    expect(result.modulations).toBeUndefined();
  });

  it("surfaces pseudo-param valid values under options.paramOptions", () => {
    registerReadableMeld();

    const result = readDevice({ id: "meld-1", include: ["options"] });

    expect(
      (result.options as Record<string, unknown>).paramOptions,
    ).toStrictEqual({
      monoPoly: ["mono", "poly"],
      polyVoices: "1-6",
      unisonVoices: "0-2",
    });
  });
});
