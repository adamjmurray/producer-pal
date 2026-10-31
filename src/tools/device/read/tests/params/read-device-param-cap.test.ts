// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readOneDevice } from "../../read-device.ts";

/**
 * Register a device with that many params, named "Param 0", "Param 1"...
 * @param count - How many params
 */
function registerDeviceWithParams(count: number): void {
  const ids = Array.from({ length: count }, (_, i) => `param-${i}`);

  registerMockObject("device-123", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      name: "Big Synth",
      class_display_name: "Big Synth",
      type: 1,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      parameters: ids.flatMap((id) => ["id", id]),
    },
  });

  for (const [i, id] of ids.entries()) {
    registerMockObject(id, {
      path: livePath.track(0).device(0).parameter(i),
      type: "DeviceParameter",
      properties: { name: `Param ${i}`, original_name: `Param ${i}` },
    });
  }
}

describe("readOneDevice param cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("lists at most 200 params and says how many there are", () => {
    registerDeviceWithParams(250);

    const result = readOneDevice({ path: "t0/d0", include: ["params"] });

    expect(result.parameters).toHaveLength(200);
    expect(result.paramCount).toBe(250);
    expect(result.detail).toBe(
      "listing the first 200 params; narrow with paramSearch",
    );
  });

  it("lists every param of a device at the cap", () => {
    registerDeviceWithParams(200);

    const result = readOneDevice({ path: "t0/d0", include: ["params"] });

    expect(result.parameters).toHaveLength(200);
    expect(result.paramCount).toBeUndefined();
    expect(result.detail).toBeUndefined();
  });

  it("counts only the params a search matches", () => {
    registerDeviceWithParams(250);

    const result = readOneDevice({ path: "t0/d0", paramSearch: "param 24" });

    expect(result.parameters).toHaveLength(11);
    expect(result.paramCount).toBeUndefined();
  });
});
