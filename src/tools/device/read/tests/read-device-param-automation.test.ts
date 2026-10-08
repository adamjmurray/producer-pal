// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readOneDevice } from "../read-device.ts";

const UNKNOWN =
  "arrangement automation unknown while the track plays from Session";

describe("readOneDevice param automation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("flags params that have a lane on a track in the arrangement", () => {
    setupDevice(String(livePath.track(0).device(0)), -1, [2, 1, 0]);

    const result = readValues();

    expect(automationOf(result)).toStrictEqual([
      "overridden",
      "active",
      undefined,
    ]);
    expect(result).not.toHaveProperty("detail");
  });

  it.each([
    ["stopped in Session", -2],
    ["a session clip playing", 0],
  ])("drops the flags and says why when the track is %s", (_label, slot) => {
    setupDevice(String(livePath.track(0).device(0)), slot, [1, 2]);

    const result = readValues();

    expect(automationOf(result)).toStrictEqual([undefined, undefined]);
    expect(result.detail).toBe(UNKNOWN);
  });

  it("checks the track once for the whole device", () => {
    setupDevice(String(livePath.track(0).device(0)), -2, [1, 1, 1]);

    readValues();

    expect(slotIndexReads()).toBe(1);
  });

  it("reads a device on a return track without asking for a clip slot", () => {
    setupDevice(String(livePath.returnTrack(0).device(0)), undefined, [1]);

    const result = readValues();

    expect(automationOf(result)).toStrictEqual(["active"]);
    expect(result).not.toHaveProperty("detail");
    expect(slotIndexReads()).toBe(0);
  });

  it("reads a device on the main track without asking for a clip slot", () => {
    setupDevice(String(livePath.masterTrack().device(0)), undefined, [2]);

    const result = readValues();

    expect(automationOf(result)).toStrictEqual(["overridden"]);
    expect(result).not.toHaveProperty("detail");
    expect(slotIndexReads()).toBe(0);
  });

  it("says nothing without values, which never carry the flag", () => {
    setupDevice(String(livePath.track(0).device(0)), -2, [1]);

    const result = readOneDevice({ id: "device-1", include: ["params"] });

    expect(result).not.toHaveProperty("detail");
    expect(slotIndexReads()).toBe(0);
  });
});

/**
 * Register a device with one on/off param per automation state, and its track.
 * @param devicePath - Live path of the device
 * @param slot - The track's playing_slot_index; none registers no track
 * @param states - Each param's automation_state
 */
function setupDevice(
  devicePath: string,
  slot: number | undefined,
  states: number[],
): void {
  if (slot != null) {
    registerMockObject("track-1", {
      path: String(livePath.track(0)),
      type: "Track",
      properties: { playing_slot_index: slot },
    });
  }

  registerMockObject("device-1", {
    path: devicePath,
    type: "Device",
    properties: {
      name: "Operator",
      class_display_name: "Operator",
      type: 1,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      parameters: children(...states.map((_, i) => `param-${i}`)),
    },
  });

  for (const [i, state] of states.entries()) {
    registerMockObject(`param-${i}`, {
      path: `${devicePath} parameters ${i}`,
      type: "DeviceParameter",
      properties: {
        name: `Param ${i}`,
        original_name: `Param ${i}`,
        value: 1,
        state: 0,
        is_enabled: 1,
        automation_state: state,
        is_quantized: 1,
        value_items: ["Off", "On"],
      },
    });
  }
}

/**
 * Read the device with its param values.
 * @returns The device entry
 */
function readValues(): Record<string, unknown> {
  return readOneDevice({ id: "device-1", include: ["param-values"] });
}

/**
 * Each param's `automation` flag, in order.
 * @param result - A device entry
 * @returns The flags, undefined where a param carries none
 */
function automationOf(result: Record<string, unknown>): unknown[] {
  return (result.parameters as Record<string, unknown>[]).map(
    (param) => param.automation,
  );
}

/**
 * How many times any track was asked for its playing_slot_index.
 * @returns Number of reads
 */
function slotIndexReads(): number {
  const track = lookupMockObject("track-1");

  return (
    track?.get.mock.calls.filter(([name]) => name === "playing_slot_index")
      .length ?? 0
  );
}
