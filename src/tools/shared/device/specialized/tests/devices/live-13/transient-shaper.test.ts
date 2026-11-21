// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { transientShaperSpec } from "../../../devices/live-13/transient-shaper.ts";
import {
  applySpecializedInactiveStates,
  getSpecForDevice,
} from "../../../specialized-device-registry.ts";

/**
 * A Transient Shaper, matched by its class_name alone.
 * @returns The device
 */
function transientShaper(): LiveAPI {
  registerMockObject("dev-1", {
    type: "Device",
    properties: {
      class_display_name: "Transient Shaper",
      class_name: "TransientShaper",
    },
  });

  return LiveAPI.from("id dev-1");
}

/**
 * The params Max lists for the device.
 * @param scOn - The S/C On value
 * @returns Parameter entries
 */
function listed(scOn: string): Record<string, unknown>[] {
  const others = [
    "Device On",
    "Attack",
    "Sustain",
    "Soft Clip On",
    "Dry/Wet",
    "S/C Emph Type",
    "S/C Gain",
  ];

  return [
    ...others.map((name) => ({ name, value: 0 })),
    { name: "S/C On", value: scOn },
  ];
}

/**
 * The names a read marked inactive.
 * @param params - Entries after the rules ran
 * @returns Their names
 */
function inactive(params: Record<string, unknown>[]): unknown[] {
  return params.flatMap((p) => (p.state === "inactive" ? [p.name] : []));
}

describe("Transient Shaper", () => {
  it("is found by class_name", () => {
    expect(getSpecForDevice(transientShaper())).toBe(transientShaperSpec);
  });

  it("marks the sidechain params inactive while S/C is off", () => {
    const params = listed("Off");

    applySpecializedInactiveStates(transientShaper(), params);

    expect(inactive(params)).toStrictEqual(["S/C Emph Type", "S/C Gain"]);
  });

  it("leaves them active while S/C is on", () => {
    const params = listed("On");

    applySpecializedInactiveStates(transientShaper(), params);

    expect(inactive(params)).toStrictEqual([]);
  });
});
