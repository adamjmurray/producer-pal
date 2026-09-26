// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import {
  readableDeviceMock,
  specializedDeviceMock,
} from "../specialized-device-mocks.ts";
import { readOneDevice } from "#src/tools/device/read/read-device.ts";
import {
  applySpecializedParamWrite,
  readSpecializedParams,
} from "../../specialized-device-registry.ts";
import { registerMonoPolyWriteTests } from "../mono-poly-test-helpers.ts";
import { expectWriteRefused } from "../refused-write-assertions.ts";

const registerMeld = specializedDeviceMock("meld-1", "MeldDevice", {
  class_display_name: "Meld",
  mono_poly: 0,
  poly_voices: 1,
  unison_voices: 0,
});

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

      applySpecializedParamWrite(device, "polyVoices", 4);

      expect(device.set).toHaveBeenCalledWith("poly_voices", 4);
    });

    it("sets poly_voices at the minimum boundary (1)", () => {
      const device = registerMeld({ poly_voices: 3 });

      applySpecializedParamWrite(device, "polyVoices", 1);

      expect(device.set).toHaveBeenCalledWith("poly_voices", 1);
    });

    it("sets poly_voices at the maximum boundary (6)", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "polyVoices", 6);

      expect(device.set).toHaveBeenCalledWith("poly_voices", 6);
    });

    it("refuses when polyVoices is above range (7)", () => {
      const device = registerMeld();

      expectWriteRefused(
        applySpecializedParamWrite(device, "polyVoices", 7),
        "polyVoices",
        "polyVoices",
      );

      expect(device.set).not.toHaveBeenCalled();
    });

    it("refuses when polyVoices is below range (0)", () => {
      const device = registerMeld();

      expectWriteRefused(
        applySpecializedParamWrite(device, "polyVoices", 0),
        "polyVoices",
        "polyVoices",
      );

      expect(device.set).not.toHaveBeenCalled();
    });
  });

  describe("write unisonVoices", () => {
    it("sets unison_voices when value is in range", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "unisonVoices", 2);

      expect(device.set).toHaveBeenCalledWith("unison_voices", 2);
    });

    it("sets unison_voices at the minimum boundary (0)", () => {
      const device = registerMeld({ unison_voices: 1 });

      applySpecializedParamWrite(device, "unisonVoices", 0);

      expect(device.set).toHaveBeenCalledWith("unison_voices", 0);
    });

    it("sets unison_voices at the maximum boundary (2)", () => {
      const device = registerMeld();

      applySpecializedParamWrite(device, "unisonVoices", 2);

      expect(device.set).toHaveBeenCalledWith("unison_voices", 2);
    });

    it("refuses when unisonVoices is above range (3)", () => {
      const device = registerMeld();

      expectWriteRefused(
        applySpecializedParamWrite(device, "unisonVoices", 3),
        "unisonVoices",
        "unisonVoices",
      );

      expect(device.set).not.toHaveBeenCalled();
    });

    it("refuses when unisonVoices is a non-integer", () => {
      const device = registerMeld();

      expectWriteRefused(
        applySpecializedParamWrite(device, "unisonVoices", 1.5),
        "unisonVoices",
        "unisonVoices",
      );

      expect(device.set).not.toHaveBeenCalled();
    });
  });
});

// Integration through the read-device tool: confirms pseudo-params surface in
// the `parameters` output and that Meld contributes no modulations/options.
describe("Meld via read-device", () => {
  const registerReadableMeld = readableDeviceMock("meld-1", "Meld", 1, {
    mono_poly: 0,
    poly_voices: 3,
    unison_voices: 1,
  });

  it("includes pseudo-params in parameters and omits modulations", () => {
    registerReadableMeld();

    const result = readOneDevice({ id: "meld-1", include: ["params"] });

    expect(result.parameters).toStrictEqual([
      { name: "monoPoly", value: "mono" },
      { name: "polyVoices", value: 3 },
      { name: "unisonVoices", value: 1 },
    ]);
    expect(result.modulations).toBeUndefined();
  });

  it("surfaces pseudo-param valid values under options.paramOptions", () => {
    registerReadableMeld();

    const result = readOneDevice({ id: "meld-1", include: ["options"] });

    expect(
      (result.options as Record<string, unknown>).paramOptions,
    ).toStrictEqual({
      monoPoly: ["mono", "poly"],
      polyVoices: "1-6",
      unisonVoices: "0-2",
    });
  });
});
