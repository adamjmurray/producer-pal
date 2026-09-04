// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A positioned insert renumbers the chain under it, so two entries naming
// positions in one chain can't both mean what they say. See create-device.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "#src/tools/device/create/create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({ warn: vi.fn() }));

/** A track holding two devices, ready to take an insert at position 1. */
function registerTrack(index: number, insertedId: string): void {
  registerMockObject(`track-${index}`, {
    path: livePath.track(index),
    properties: { devices: children("device-a", "device-b") },
    methods: { insert_device: () => ["id", insertedId] },
  });
  registerMockObject(insertedId, { path: livePath.track(index).device(1) });
}

describe("createDevice insertion order", () => {
  beforeEach(() => {
    registerTrack(0, "created-0");
    registerTrack(1, "created-1");
  });

  it("refuses a second positioned entry for the same chain", () => {
    expect(() =>
      createDevice({ path: "t0/d1,t0/d2", deviceName: "Utility" }),
    ).toThrow(
      'path entry "t0/d2" is spelled through "t0", which an ' +
        "earlier entry renumbers by inserting into it. Make these calls " +
        "separately, or name where the device should land after that insert.",
    );
  });

  // Live re-sorts a chain around anything but an audio effect, so an append
  // moves siblings and a position named after one is no more trustworthy than
  // one named after an insert.
  it("refuses a positioned entry after appending a device Live re-sorts", () => {
    expect(() =>
      createDevice({ path: "t0,t0/d1", deviceName: "Operator" }),
    ).toThrow('path entry "t0/d1" is spelled through "t0"');
  });

  // An audio effect goes on the end, so an append leaves every position it
  // didn't name exactly where it was.
  it("allows a positioned entry after appending an audio effect", () => {
    expect(() =>
      createDevice({ path: "t0,t0/d1", deviceName: "Utility" }),
    ).not.toThrow(/spelled through/);
  });

  it("refuses a positioned entry inside a chain an earlier entry filled", () => {
    expect(() =>
      createDevice({ path: "t0/d0/c0,t0/d0/c0/d0", deviceName: "Operator" }),
    ).toThrow('path entry "t0/d0/c0/d0" is spelled through "t0/d0/c0"');
  });

  // An append names no position of its own, so nothing about it goes stale.
  it("allows an append after a positioned entry for the same chain", () => {
    expect(
      createDevice({ path: "t0/d1,t0", deviceName: "Utility" }),
    ).toStrictEqual([
      { id: "created-0", path: "t0/d1" },
      { id: "created-0", path: "t0/d1" },
    ]);
  });

  it("allows two appends to the same chain", () => {
    expect(
      createDevice({ path: "t0,t0", deviceName: "Utility" }),
    ).toStrictEqual([
      { id: "created-0", path: "t0/d1" },
      { id: "created-0", path: "t0/d1" },
    ]);
  });

  it("allows the same position in two different tracks", () => {
    expect(
      createDevice({ path: "t0/d1,t1/d1", deviceName: "Utility" }),
    ).toStrictEqual([
      { id: "created-0", path: "t0/d1" },
      { id: "created-1", path: "t1/d1" },
    ]);
  });

  // The second entry names no position in t0, but its own path is spelled
  // through t0's device list, which the first entry has just renumbered.
  it("refuses an entry sitting below a chain an earlier entry renumbered", () => {
    expect(() =>
      createDevice({ path: "t0/d1,t0/d2/c0", deviceName: "Utility" }),
    ).toThrow('path entry "t0/d2/c0" is spelled through "t0"');
  });

  // Note names are case-insensitive, so both entries name pad 36 and the second
  // one's position has moved.
  it("refuses two spellings of the same drum pad", () => {
    expect(() =>
      createDevice({
        path: "t0/d0/pC1/d1,t0/d0/pc1/d2",
        deviceName: "Utility",
      }),
    ).toThrow('path entry "t0/d0/pc1/d2" is spelled through "t0/d0/pC1"');
  });

  it("allows two different drum pads in one rack", () => {
    expect(() =>
      createDevice({
        path: "t0/d0/pC1/d1,t0/d0/pD1/d1",
        deviceName: "Utility",
      }),
    ).not.toThrow(/spelled through/);
  });

  // A path that holds no device is still the insert loop's to report, one
  // entry at a time, so the pre-flight check passes over it.
  it("leaves an entry that names no container to the insert loop", () => {
    expect(
      createDevice({ path: "s0,t0/d1", deviceName: "Utility" }),
    ).toStrictEqual({ id: "created-0", path: "t0/d1" });
  });
});
