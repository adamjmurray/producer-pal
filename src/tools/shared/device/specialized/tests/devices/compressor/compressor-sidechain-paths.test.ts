// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { beforeEach, describe, expect, it } from "vitest";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { applySpecializedParamWrite } from "../../../specialized-device-registry.ts";
import {
  DEFAULT_AVAILABLE_TYPES,
  MASTER_ENTRY,
  registerCompressor,
  RETURN_ENTRY,
} from "./compressor-test-helpers.ts";
import { expectWriteRefused } from "../../refused-write-assertions.ts";

// A regular track, a return and the master, each at its Live path.
beforeEach(() => {
  registerMockObject("live_set", { path: "live_set", type: "Device" });
  registerMockObject("101", {
    path: "live_set tracks 0",
    type: "Device",
    properties: { name: "Drift" },
  });
  registerMockObject("201", {
    path: "live_set return_tracks 0",
    type: "Device",
    properties: { name: "A-Reverb" },
  });
  registerMockObject("301", {
    path: "live_set master_track",
    type: "Device",
    properties: { name: "Main" },
  });
});

function write(
  value: string,
  device: LiveAPI,
): ReturnType<typeof applySpecializedParamWrite> {
  return applySpecializedParamWrite(device, "sidechainSourceTrackId", value);
}

describe("Compressor sidechainSourceTrackId given a path", () => {
  it.each([
    ["t0", 3],
    ["rt0", 30],
    ["mt", 40],
  ])("accepts %s", (path, identifier) => {
    const device = registerCompressor({
      availableTypes: [...DEFAULT_AVAILABLE_TYPES, RETURN_ENTRY, MASTER_ENTRY],
    });

    write(path, device);

    expect(device.set).toHaveBeenCalledWith(
      "input_routing_type",
      JSON.stringify({ input_routing_type: { identifier } }),
    );
  });

  it("still accepts an id", () => {
    const device = registerCompressor();

    write("101", device);

    expect(device.set).toHaveBeenCalledWith(
      "input_routing_type",
      JSON.stringify({ input_routing_type: { identifier: 3 } }),
    );
  });

  it("refuses a path with nothing at it", () => {
    mockNonExistentObjects();
    const device = registerCompressor();

    expectWriteRefused(
      write("t9", device),
      "sidechainSourceTrackId",
      'no track at sidechainSourceTrackId "t9"',
    );
    expect(device.set).not.toHaveBeenCalled();
  });

  it("refuses a path that is not a track", () => {
    const device = registerCompressor();

    expectWriteRefused(
      write("t0/d0", device),
      "sidechainSourceTrackId",
      "not a track",
    );
    expect(device.set).not.toHaveBeenCalled();
  });
});
