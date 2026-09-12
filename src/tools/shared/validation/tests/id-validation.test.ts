// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { validateIdType, validateIdTypes } from "../id-validation.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

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
      "is not a Track (found Track)",
    );
    expect(() => validateIdType(id, "TRACK")).toThrow(
      "is not a TRACK (found Track)",
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
      "s0 (id scene_1) is not a track (found Scene)",
    );
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
      "MixerDevice",
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
        `t0 (id track_1) is not a ${expectedType} (found Track)`,
      );
    }
  });
});

describe("validateIdTypes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  describe("with skipInvalid=false (default)", () => {
    it("should return array of LiveAPI instances for all valid IDs", () => {
      const ids = ["track_1", "track_2", "track_3"];

      registerMockObject("track_1", {
        path: "live_set tracks 0",
        type: "Track",
      });
      registerMockObject("track_2", {
        path: "live_set tracks 1",
        type: "Track",
      });
      registerMockObject("track_3", {
        path: "live_set tracks 2",
        type: "Track",
      });

      const result = validateIdTypes(ids, "track");

      expect(result).toHaveLength(3);
      expect(result[0]!.id).toBe("track_1");
      expect(result[1]!.id).toBe("track_2");
      expect(result[2]!.id).toBe("track_3");
    });

    it("should throw on first invalid ID (non-existent)", () => {
      const ids = ["track_1", "nonexistent", "track_3"];

      registerMockObject("track_1", {
        path: "live_set tracks 0",
        type: "Track",
      });
      registerMockObject("track_3", {
        path: "live_set tracks 2",
        type: "Track",
      });

      mockNonExistentObjects();

      expect(() => validateIdTypes(ids, "track")).toThrow(
        'id "nonexistent" does not exist',
      );
    });

    it("should throw on first invalid ID (wrong type)", () => {
      const ids = registerMixedTrackAndSceneMocks();

      expect(() => validateIdTypes(ids, "track")).toThrow(
        "s0 (id scene_1) is not a track (found Scene)",
      );
    });
  });

  describe("with skipInvalid=true", () => {
    it("should return only valid IDs and log warnings for invalid", () => {
      const ids = registerMixedTrackAndSceneMocks();

      const result = validateIdTypes(ids, "track", {
        skipInvalid: true,
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("track_1");
      expect(result[1]!.id).toBe("track_3");
      expect(capturedWarnings()).toContain(
        "s0 (id scene_1) is not a track (found Scene)",
      );
    });

    it("should return empty array when all IDs are invalid (non-existent)", () => {
      const ids = ["nonexistent_1", "nonexistent_2"];

      mockNonExistentObjects();

      const result = validateIdTypes(ids, "track", {
        skipInvalid: true,
      });

      expect(result).toHaveLength(0);
      expect(capturedWarnings()).toContain('id "nonexistent_1" does not exist');
      expect(capturedWarnings()).toContain('id "nonexistent_2" does not exist');
    });

    it("should return empty array when all IDs are wrong type", () => {
      const ids = ["scene_1", "scene_2"];

      registerMockObject("scene_1", {
        path: "live_set scenes 0",
        type: "Scene",
      });
      registerMockObject("scene_2", {
        path: "live_set scenes 1",
        type: "Scene",
      });

      const result = validateIdTypes(ids, "track", {
        skipInvalid: true,
      });

      expect(result).toHaveLength(0);
      expect(capturedWarnings()).toHaveLength(2);
    });

    it("should handle mix of non-existent and wrong type IDs", () => {
      const ids = ["nonexistent", "scene_1", "track_1"];

      registerMockObject("scene_1", {
        path: "live_set scenes 0",
        type: "Scene",
      });
      registerMockObject("track_1", {
        path: "live_set tracks 0",
        type: "Track",
      });

      mockNonExistentObjects();

      const result = validateIdTypes(ids, "track", {
        skipInvalid: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("track_1");
      expect(capturedWarnings()).toContain('id "nonexistent" does not exist');
      expect(capturedWarnings()).toContain(
        "s0 (id scene_1) is not a track (found Scene)",
      );
    });

    it("should accept device subclasses when validating device type", () => {
      const ids = ["device_1", "device_2", "device_3"];

      registerMockObject("device_1", {
        path: "live_set tracks 0 devices 0",
        type: "Eq8Device",
      });
      registerMockObject("device_2", {
        path: "live_set tracks 0 devices 1",
        type: "HybridReverbDevice",
      });
      registerMockObject("device_3", {
        path: "live_set tracks 0 devices 2",
        type: "SimplerDevice",
      });

      const result = validateIdTypes(ids, "device", {
        skipInvalid: true,
      });

      expect(result).toHaveLength(3);
      expect(result[0]!.id).toBe("device_1");
      expect(result[1]!.id).toBe("device_2");
      expect(result[2]!.id).toBe("device_3");
    });
  });
});

/**
 * Register a mix of track and scene mock objects for testing type validation.
 * @returns The IDs array used for testing
 */
function registerMixedTrackAndSceneMocks(): string[] {
  const ids = ["track_1", "scene_1", "track_3"];

  registerMockObject("track_1", {
    path: "live_set tracks 0",
    type: "Track",
  });
  registerMockObject("scene_1", {
    path: "live_set scenes 0",
    type: "Scene",
  });
  registerMockObject("track_3", {
    path: "live_set tracks 2",
    type: "Track",
  });

  return ids;
}
