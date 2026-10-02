// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { validateIdType } from "../id-validation.ts";

describe("validateIdType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("should return LiveAPI instance for valid ID with matching type", () => {
    const id = "track_1";

    registerMockObject(id, {
      path: "live_set tracks 0",
      type: "Track",
    });

    const result = validateIdType(id, "track");

    expect(result).toBeDefined();
    expect(result.id).toBe(id);
    expect(result.type).toBe("Track");
  });

  it("should reject mismatched case for expected type", () => {
    const id = "track_1";

    registerMockObject(id, {
      path: "live_set tracks 0",
      type: "Track",
    });

    // Tool-level types must be exact lowercase
    expect(() => validateIdType(id, "track")).not.toThrow();
    expect(() => validateIdType(id, "Track")).toThrow(
      "is not a Track (found track)",
    );
    expect(() => validateIdType(id, "TRACK")).toThrow(
      "is not a TRACK (found track)",
    );
  });

  it("should throw error when ID does not exist", () => {
    const id = "nonexistent_id";

    mockNonExistentObjects();

    expect(() => validateIdType(id, "track")).toThrow(
      'id "nonexistent_id" does not exist',
    );
  });

  it("should throw error when type does not match", () => {
    const id = "scene_1";

    registerMockObject(id, {
      path: "live_set scenes 0",
      type: "Scene",
    });

    expect(() => validateIdType(id, "track")).toThrow(
      "s0 (id scene_1) is not a track (found scene)",
    );
  });

  it("names what it found in the tools' words, not Live's class names", () => {
    registerMockObject("chain_1", {
      path: "live_set tracks 0 devices 0 chains 0",
      type: "DrumChain",
    });

    expect(() => validateIdType("chain_1", "track")).toThrow(
      "is not a track (found chain)",
    );
  });

  it("says only that the type is wrong for a class the tools never name", () => {
    registerMockObject("groove_1", {
      path: "live_set grooves 0",
      type: "Groove",
    });

    expect(() => validateIdType("groove_1", "track")).toThrow(
      "id groove_1 is not a track",
    );
    expect(() => validateIdType("groove_1", "track")).not.toThrow("(found");
  });

  it("should match device subclasses to device type", () => {
    const id = "device_1";

    // Test various device subclasses from the Live Object Model
    const deviceSubclasses = [
      "Device",
      "Eq8Device",
      "HybridReverbDevice",
      "SimplerDevice",
      "WavetableDevice",
      "PluginDevice",
      "RackDevice",
    ] as const;

    for (const subclass of deviceSubclasses) {
      vi.clearAllMocks();
      clearMockRegistry();

      registerMockObject(id, {
        path: "live_set tracks 0 devices 0",
        type: subclass,
      });

      expect(() => validateIdType(id, "device")).not.toThrow();
    }
  });

  it("should not match a mixer to device type", () => {
    for (const mixerType of ["MixerDevice", "ChainMixerDevice"] as const) {
      registerMockObject("mixer_1", {
        path: livePath.track(0).mixerDevice(),
        type: mixerType,
      });

      expect(() => validateIdType("mixer_1", "device")).toThrow(
        "is not a device (found mixer)",
      );
    }
  });

  it("should match DrumPad to drum-pad type", () => {
    const id = "pad_1";

    registerMockObject(id, {
      path: "live_set tracks 0 devices 0 drum_pads 0",
      type: "DrumPad",
    });

    expect(() => validateIdType(id, "drum-pad")).not.toThrow();
  });

  it("should reject a Track against every non-track expected type", () => {
    // A single Track exercises the negative branch of each isTypeMatch case:
    // "scene"/"clip" strict equality, "device" endsWith, "drum-pad" OR, and the
    // default (unknown type) — each must NOT match a Track.
    registerMockObject("track_1", {
      path: "live_set tracks 0",
      type: "Track",
    });

    for (const expectedType of [
      "scene",
      "clip",
      "device",
      "drum-pad",
      "mystery-type",
    ]) {
      expect(() => validateIdType("track_1", expectedType)).toThrow(
        `t0 (id track_1) is not a ${expectedType} (found track)`,
      );
    }
  });
});
