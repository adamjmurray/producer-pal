// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isDeviceTreeType } from "#src/tools/shared/device/device-target-types.ts";
import { isDeviceClass } from "../is-device-class.ts";

const MIXERS = ["MixerDevice", "ChainMixerDevice"];

describe("isDeviceClass", () => {
  it.each(["Device", "Eq8Device", "RackDevice", "SomeFutureDevice"])(
    "accepts %s",
    (type) => {
      expect(isDeviceClass(type)).toBe(true);
    },
  );

  it.each([
    ...MIXERS,
    "Track",
    "Chain",
    "DrumPad",
    "Device.View",
    "DeviceParameter",
    "DeviceIO",
  ])("rejects %s", (type) => {
    expect(isDeviceClass(type)).toBe(false);
  });
});

describe("device-tree check rejects the mixers", () => {
  it.each(MIXERS)("%s is not a device-tree object", (type) => {
    expect(isDeviceTreeType(type)).toBe(false);
  });

  it.each(["Eq8Device", "RackDevice", "Chain", "DrumChain", "DrumPad"])(
    "%s is still a device-tree object",
    (type) => {
      expect(isDeviceTreeType(type)).toBe(true);
    },
  );
});
