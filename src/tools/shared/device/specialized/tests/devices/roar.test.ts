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
 * Register a mock Roar device and return its LiveAPI.
 * @param properties - Property overrides (merged onto Roar defaults)
 * @returns The Roar LiveAPI object
 */
function registerRoar(properties: Record<string, unknown> = {}): LiveAPI {
  registerMockObject("roar-1", {
    type: "RoarDevice",
    properties: {
      class_display_name: "Roar",
      routing_mode_index: 0,
      env_listen: 0,
      ...properties,
    },
  });

  return LiveAPI.from("id roar-1");
}

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

      applySpecializedParamWrite(device, "routingMode", "delay");

      expect(device.set).toHaveBeenCalledWith("routing_mode_index", 6);
    });

    it("is case-insensitive on the param name", () => {
      const device = registerRoar();

      applySpecializedParamWrite(device, "routingmode", "parallel");

      expect(device.set).toHaveBeenCalledWith("routing_mode_index", 2);
    });

    it("warns and skips an invalid routing mode", () => {
      const device = registerRoar();

      applySpecializedParamWrite(device, "routingMode", "bogus");

      expect(device.set).not.toHaveBeenCalled();
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("not a valid routingMode"),
      );
    });
  });

  describe("write envListen", () => {
    it("writes 1 for true", () => {
      const device = registerRoar();

      applySpecializedParamWrite(device, "envListen", "true");

      expect(device.set).toHaveBeenCalledWith("env_listen", 1);
    });

    it("writes 0 for false", () => {
      const device = registerRoar({ env_listen: 1 });

      applySpecializedParamWrite(device, "envListen", "off");

      expect(device.set).toHaveBeenCalledWith("env_listen", 0);
    });

    it("warns naming envListen and skips uninterpretable input", () => {
      const device = registerRoar();

      applySpecializedParamWrite(device, "envListen", "maybe");

      expect(device.set).not.toHaveBeenCalled();
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(
          '"maybe" is not a valid envListen (expected true/false)',
        ),
      );
    });
  });
});

// Integration through the read-device tool: confirms pseudo-params surface in
// the `parameters` output and that Roar contributes no modulations/options.
describe("Roar via read-device", () => {
  /**
   * Register a fully-readable mock Roar device by ID.
   * @param properties - Property overrides
   */
  function registerReadableRoar(
    properties: Record<string, unknown> = {},
  ): void {
    registerMockObject("roar-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        name: "Roar",
        class_display_name: "Roar",
        type: 2,
        can_have_chains: 0,
        can_have_drum_pads: 0,
        is_active: 1,
        parameters: [],
        routing_mode_index: 3,
        env_listen: 1,
        ...properties,
      },
    });
  }

  it("includes pseudo-params in parameters and omits modulations", () => {
    registerReadableRoar();

    const result = readDevice({ id: "roar-1", include: ["params"] });

    expect(result.parameters).toStrictEqual([
      { name: "routingMode", value: "multi-band" },
      { name: "envListen", value: true },
    ]);
    expect(result.modulations).toBeUndefined();
  });

  it("surfaces pseudo-param valid values under options.paramOptions", () => {
    registerReadableRoar();

    const result = readDevice({ id: "roar-1", include: ["options"] });

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
