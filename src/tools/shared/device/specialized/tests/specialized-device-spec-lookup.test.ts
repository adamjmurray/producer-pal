// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import "#src/live-api-adapter/live-api-extensions.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginLiveApiScope,
  endLiveApiScope,
} from "#src/live-api-adapter/live-api-release.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  applySpecializedParamWrite,
  getSpecForDevice,
  readSpecializedParams,
} from "../specialized-device-registry.ts";

// A device no spec matches costs two reads to find that out (display name, then
// class_name). A call asks about the same device many times, so it must pay for
// them once.

afterEach(() => {
  endLiveApiScope();
});

/**
 * Register a device and count the reads of one property on it.
 * @param properties - The device's properties
 * @returns The device and a counter of class_name reads
 */
function countedDevice(properties: Record<string, string>): {
  device: LiveAPI;
  classNameReads: () => number;
} {
  registerMockObject("dev-1", { type: "Device", properties });

  const device = LiveAPI.from("id dev-1");
  const getProperty = vi.spyOn(device, "getProperty");

  return {
    device,
    classNameReads: () =>
      getProperty.mock.calls.filter(([name]) => name === "class_name").length,
  };
}

describe("getSpecForDevice across a call", () => {
  it("reads a generic device's class once over a multi-key write", () => {
    beginLiveApiScope();

    const { device, classNameReads } = countedDevice({
      class_display_name: "Operator",
      class_name: "Operator",
    });

    for (let i = 0; i < 20; i++) {
      expect(applySpecializedParamWrite(device, `Param ${i}`, 1)).toBeNull();
    }

    readSpecializedParams(device);

    expect(classNameReads()).toBe(1);
  });

  it("still finds a spec by class_name through the memo", () => {
    beginLiveApiScope();

    const { device } = countedDevice({
      class_display_name: "Drum Synth",
      class_name: "DrumSynth",
    });

    expect(getSpecForDevice(device)).toBe(getSpecForDevice(device));
    expect(getSpecForDevice(device)).toBeDefined();
  });
});
