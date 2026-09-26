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
import { expectWriteRefused } from "../refused-write-assertions.ts";

const registerEqEight = specializedDeviceMock("eq8-1", "Eq8Device", {
  class_display_name: "EQ Eight",
  global_mode: 0,
  oversample: 0,
});

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

      applySpecializedParamWrite(device, "globalMode", "stereo");

      expect(device.set).toHaveBeenCalledWith("global_mode", 0);
    });

    it("maps L/R label to index 1", () => {
      const device = registerEqEight();

      applySpecializedParamWrite(device, "globalMode", "L/R");

      expect(device.set).toHaveBeenCalledWith("global_mode", 1);
    });

    it("maps M/S label to index 2", () => {
      const device = registerEqEight();

      applySpecializedParamWrite(device, "globalMode", "M/S");

      expect(device.set).toHaveBeenCalledWith("global_mode", 2);
    });

    it("refuses an invalid globalMode", () => {
      const device = registerEqEight();

      expectWriteRefused(
        applySpecializedParamWrite(device, "globalMode", "bogus"),
        "globalMode",
        "not a valid globalMode",
      );

      expect(device.set).not.toHaveBeenCalled();
    });

    it("is case-insensitive on the param name", () => {
      const device = registerEqEight();

      applySpecializedParamWrite(device, "globalmode", "stereo");

      expect(device.set).toHaveBeenCalledWith("global_mode", 0);
    });
  });

  describe("write oversample", () => {
    it("writes 1 for true", () => {
      const device = registerEqEight();

      applySpecializedParamWrite(device, "oversample", "true");

      expect(device.set).toHaveBeenCalledWith("oversample", 1);
    });

    it("writes 0 for false", () => {
      const device = registerEqEight({ oversample: 1 });

      applySpecializedParamWrite(device, "oversample", "false");

      expect(device.set).toHaveBeenCalledWith("oversample", 0);
    });

    it("refuses uninterpretable input, naming oversample", () => {
      const device = registerEqEight();

      expectWriteRefused(
        applySpecializedParamWrite(device, "oversample", "maybe"),
        "oversample",
        '"maybe" is not a valid oversample (expected true/false)',
      );

      expect(device.set).not.toHaveBeenCalled();
    });
  });
});

// Integration through the read-device tool: confirms pseudo-params surface in
// the `parameters` output and that EQ Eight contributes no modulations/options.
describe("EQ Eight via read-device", () => {
  const registerReadableEqEight = readableDeviceMock("eq8-1", "EQ Eight", 2, {
    global_mode: 1,
    oversample: 0,
  });

  it("includes pseudo-params in parameters and omits modulations", () => {
    registerReadableEqEight();

    const result = readOneDevice({ id: "eq8-1", include: ["params"] });

    expect(result.parameters).toStrictEqual([
      { name: "globalMode", value: "L/R" },
      { name: "oversample", value: false },
    ]);
    expect(result.modulations).toBeUndefined();
  });

  it("surfaces pseudo-param valid values under options.paramOptions", () => {
    registerReadableEqEight();

    const result = readOneDevice({ id: "eq8-1", include: ["options"] });

    expect(
      (result.options as Record<string, unknown>).paramOptions,
    ).toStrictEqual({ globalMode: ["stereo", "L/R", "M/S"] });
  });
});
