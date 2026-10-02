// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `d+` as a move destination: put the device at the end of that container,
// without reading it first to find out what the end is.

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  children,
  livePath,
  mockWorkingDeviceMoves,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";

const RACK = livePath.track(1).device(0);

describe("updateDevice — d+ as a move destination", () => {
  beforeEach(() => {
    mockWorkingDeviceMoves();
    registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "Device",
    });
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("rack-1") },
    });
    registerMockObject("rack-1", {
      path: RACK,
      type: "RackDevice",
      properties: {
        chains: children("chain-0"),
        can_have_chains: 1,
        can_have_drum_pads: 0,
      },
    });
    registerMockObject("chain-0", {
      path: RACK.chain(0),
      type: "Chain",
      properties: { devices: children("resident-0") },
    });
    registerMockObject("resident-0", { path: RACK.chain(0).device(0) });
  });

  it("moves a device to the end of a track", () => {
    expect(updateDevice({ id: "device-0", toPath: "t1/d+" })).toStrictEqual({
      id: "device-0",
      path: "t1/d1",
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("moves a device to the end of a rack chain", () => {
    expect(
      updateDevice({ id: "device-0", toPath: "t1/d0/c0/d+" }),
    ).toStrictEqual({ id: "device-0", path: "t1/d0/c0/d1" });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // A device that exists is what `path` addresses, so the append marker is a
  // spelling mistake there — and the refusal names the tools that take it.
  it("refuses a d+ as the device to update", () => {
    expect(() => updateDevice({ path: "t1/d+", name: "x" })).toThrow(
      'invalid path "t1/d+" - "d+" appends a device, which only ' +
        "ppal-create-device, ppal-duplicate and ppal-update-device do; " +
        'name an existing device as "d<index>"',
    );
  });
});
