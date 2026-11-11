// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readOneDevice } from "../../read-device.ts";

/**
 * Register an EQ Eight in the given mode with one on/off param per side of
 * band 3 and one of band 4.
 * @param globalMode - Live's global_mode (0 stereo, 1 L/R, 2 M/S)
 */
function registerEqEight(globalMode: number): void {
  const names = ["3 Filter On A", "3 Filter On B", "4 Filter On B"];

  for (const [i, name] of names.entries()) {
    registerMockObject(`p${i}`, {
      path: livePath.track(0).device(0).parameter(i),
      type: "DeviceParameter",
      properties: {
        name,
        original_name: name,
        value: 1,
        state: 0,
        is_enabled: 1,
        automation_state: 0,
        is_quantized: 1,
        value_items: ["Off", "On"],
      },
    });
  }

  registerMockObject("eq", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      name: "EQ Eight",
      class_display_name: "EQ Eight",
      type: 2,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      global_mode: globalMode,
      parameters: children("p0", "p1", "p2"),
    },
  });
}

/**
 * Read the EQ Eight's param values through a search.
 * @param paramSearch - The search text
 * @returns The listed params
 */
function searched(paramSearch: string): Record<string, unknown>[] {
  const result = readOneDevice({
    id: "eq",
    include: ["param-values"],
    paramSearch,
  });

  return result.parameters as Record<string, unknown>[];
}

describe("readOneDevice - inactive rules under a param search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("marks B-side params inactive in stereo when the search leaves the mode out", () => {
    registerEqEight(0);

    expect(searched("3 ")).toStrictEqual([
      { id: "p0", name: "3 Filter On A", value: "On" },
      { id: "p1", name: "3 Filter On B", value: "On", state: "inactive" },
    ]);
  });

  it("leaves the B side active outside stereo", () => {
    registerEqEight(1);

    expect(searched("3 ").map((p) => p.state)).toStrictEqual([
      undefined,
      undefined,
    ]);
  });

  it("matches the unsearched read", () => {
    registerEqEight(0);

    const all = searched("");
    const some = searched("4 ");

    expect(some).toStrictEqual([all.find((p) => p.name === "4 Filter On B")]);
  });
});
