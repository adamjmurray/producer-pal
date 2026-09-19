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

const registerRoar = specializedDeviceMock("roar-1", "RoarDevice", {
  class_display_name: "Roar",
  routing_mode_index: 0,
  env_listen: 0,
});

describe("Roar pseudo-params", () => {
  describe("read", () => {
    it("reads routingMode and envListen", () => {
      const device = registerRoar({ routing_mode_index: 4, env_listen: 1 });

      expect(readSpecializedParams(device)).toStrictEqual([
        { name: "routingMode", value: "mid-side" },
        { name: "envListen", value: true },
      ]);
    });

    it("reads the first routing mode", () => {
      const device = registerRoar({ routing_mode_index: 0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "routingMode",
        value: "single",
      });
    });
  });

  describe("write routingMode", () => {
    it("maps the enum label to its index", () => {
      const device = registerRoar();

      expect(
        applySpecializedParamWrite(device, "routingMode", "delay"),
      ).toHaveLength(1);

      expect(device.set).toHaveBeenCalledWith("routing_mode_index", 6);
    });

    it("is case-insensitive on the param name", () => {
      const device = registerRoar();

      applySpecializedParamWrite(device, "routingmode", "parallel");

      expect(device.set).toHaveBeenCalledWith("routing_mode_index", 2);
    });

    it("refuses an invalid routing mode", () => {
      const device = registerRoar();

      expectWriteRefused(
        applySpecializedParamWrite(device, "routingMode", "bogus"),
        "routingMode",
        "not a valid routingMode",
      );

      expect(device.set).not.toHaveBeenCalled();
    });
  });

  describe("write envListen", () => {
    it("writes 1 for true", () => {
      const device = registerRoar();

      expect(
        applySpecializedParamWrite(device, "envListen", "true"),
      ).toHaveLength(1);

      expect(device.set).toHaveBeenCalledWith("env_listen", 1);
    });

    it("writes 0 for false", () => {
      const device = registerRoar({ env_listen: 1 });

      applySpecializedParamWrite(device, "envListen", "off");

      expect(device.set).toHaveBeenCalledWith("env_listen", 0);
    });

    it("refuses uninterpretable input, naming envListen", () => {
      const device = registerRoar();

      expectWriteRefused(
        applySpecializedParamWrite(device, "envListen", "maybe"),
        "envListen",
        '"maybe" is not a valid envListen (expected true/false)',
      );

      expect(device.set).not.toHaveBeenCalled();
    });
  });
});

// Integration through the read-device tool: confirms pseudo-params surface in
// the `parameters` output and that Roar contributes no modulations/options.
describe("Roar via read-device", () => {
  const registerReadableRoar = readableDeviceMock("roar-1", "Roar", 2, {
    routing_mode_index: 3,
    env_listen: 1,
  });

  it("includes pseudo-params in parameters and omits modulations", () => {
    registerReadableRoar();

    const result = readOneDevice({ id: "roar-1", include: ["params"] });

    expect(result.parameters).toStrictEqual([
      { name: "routingMode", value: "multi-band" },
      { name: "envListen", value: true },
    ]);
    expect(result.modulations).toBeUndefined();
  });

  it("surfaces pseudo-param valid values under options.paramOptions", () => {
    registerReadableRoar();

    const result = readOneDevice({ id: "roar-1", include: ["options"] });

    expect(
      (result.options as Record<string, unknown>).paramOptions,
    ).toStrictEqual({
      routingMode: [
        "single",
        "serial",
        "parallel",
        "multi-band",
        "mid-side",
        "feedback",
        "delay",
      ],
    });
  });
});
